const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

/**
 * Cloud Function to handle accepting a request (order, shipper_request, ride_request).
 * This function is callable from the client (shipper.html).
 * It assigns the current authenticated user (shipper/driver) to the request
 * and updates its status.
 */
exports.acceptRequest = functions.https.onCall(async (data, context) => {
    // --- START DEBUGGING LOGS ---
    console.log("Cloud Function received raw data parameter:", data); // Log the raw data parameter
    console.log("Full context object:", JSON.stringify(context, null, 2));
    console.log("Cloud Function GCLOUD_PROJECT env var:", process.env.GCLOUD_PROJECT);
    console.log("Context Auth Status (for debug):", context.auth ? "Present" : "Missing");
    if (context.auth) {
        console.log("Context Auth UID (for debug):", context.auth.uid);
        console.log("Context Auth Token (role) (for debug):", context.auth.token ? context.auth.token.role : "N/A");
    }
    // --- END DEBUGGING LOGS ---

    // 1. Check if user is authenticated via context.auth (this is the standard way for callable functions)
    // Dựa trên nhật ký, context.auth đã VALID, nên chúng ta sẽ tin tưởng nó.
    if (!context.auth) {
        console.error("Authentication context missing. User is not authenticated.");
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Yêu cầu phải được xác thực.'
        );
    }

    // Sử dụng thông tin từ context.auth vì nó đã được xác minh bởi Firebase Callable Functions SDK
    const currentUserId = context.auth.uid;
    const userRole = context.auth.token.role; // Lấy custom claim 'role' từ token

    // 2. Validate input data from 'data' payload
    // Dựa trên nhật ký, payload thực sự từ client nằm trong data.data
    const clientPayload = data.data; // Trích xuất payload thực sự

    if (!clientPayload) {
        console.error("Client payload 'data.data' is missing.");
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Thiếu dữ liệu payload từ client.'
        );
    }

    const userIdFromClient = clientPayload.userId; // userId của khách hàng đã tạo yêu cầu
    const collectionName = clientPayload.collectionName;
    const requestId = clientPayload.requestId;
    const type = clientPayload.type;

    // Loại bỏ việc xác minh idToken thủ công vì context.auth đã VALID
    // và chúng ta đang dựa vào xác minh nội bộ của hàm callable.

    if (!userIdFromClient || !collectionName || !requestId || !type) {
        console.error("Missing information in client payload:", { userIdFromClient, collectionName, requestId, type });
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Thiếu thông tin yêu cầu (userId, collectionName, requestId, type).'
        );
    }

    // Ensure the collectionName is one of the allowed types for safety
    const allowedCollections = ['orders', 'shipper_requests', 'ride_requests'];
    if (!allowedCollections.includes(collectionName)) {
        console.error("Invalid collection name received:", collectionName);
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Tên collection không hợp lệ.'
        );
    }

    // 3. Validate user role based on request type
    if ((type === 'food_order' || type === 'shipper_request') && userRole !== 'shipper') {
        console.error("Permission denied: User role", userRole, "cannot accept type", type);
        throw new functions.https.HttpsError(
            'permission-denied',
            'Bạn không có quyền shipper để chấp nhận yêu cầu này.'
        );
    }
    if (type === 'ride_request' && userRole !== 'driver') {
        console.error("Permission denied: User role", userRole, "cannot accept type", type);
        throw new functions.https.HttpsError(
            'permission-denied',
            'Bạn không có quyền tài xế để chấp nhận yêu cầu này.'
        );
    }

    // Construct the document reference path using process.env.GCLOUD_PROJECT
    const app_id = process.env.GCLOUD_PROJECT;
    if (!app_id) {
        console.error("GCLOUD_PROJECT environment variable is not set. Cannot determine Firebase project ID.");
        throw new functions.https.HttpsError(
            'internal',
            'Cấu hình dự án Firebase bị thiếu.'
        );
    }
    // Use userIdFromClient to correctly locate the customer's request document
    const requestRef = db.doc(`artifacts/${app_id}/users/${userIdFromClient}/${collectionName}/${requestId}`);
    console.log("Constructed Firestore path:", `artifacts/${app_id}/users/${userIdFromClient}/${collectionName}/${requestId}`);

    try {
        // Use a transaction to ensure atomicity: read, then conditionally update
        await db.runTransaction(async (transaction) => {
            const requestDoc = await transaction.get(requestRef);

            if (!requestDoc.exists) {
                console.error("Request document not found:", requestRef.path);
                throw new functions.https.HttpsError(
                    'not-found',
                    'Yêu cầu không tồn tại.'
                );
            }

            const currentData = requestDoc.data();
            console.log("Current document data:", currentData);

            // Check if the request is already assigned to someone else
            let assignedField = '';
            let assignedStatus = '';
            if (type === 'food_order' || type === 'shipper_request') {
                assignedField = 'assignedShipperId';
                assignedStatus = 'Đã gán shipper';
            } else if (type === 'ride_request') {
                assignedField = 'assignedDriverId';
                assignedStatus = 'Đã gán tài xế';
            }

            if (currentData[assignedField] && currentData[assignedField] !== currentUserId) {
                console.error("Request already assigned to another user:", currentData[assignedField]);
                throw new functions.https.HttpsError(
                    'already-exists',
                    'Yêu cầu này đã được gán cho một người khác.'
                );
            }

            // If not assigned or assigned to current user (re-accepting/re-confirming)
            // Perform the update
            const updateData = {
                status: assignedStatus,
                [assignedField]: currentUserId // Assign the current authenticated shipper/driver
            };
            console.log("Updating document with data:", updateData);

            transaction.update(requestRef, updateData);
        });

        return { message: 'Yêu cầu đã được chấp nhận thành công!' };

    } catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error; // Re-throw Firebase HttpsError
        }
        console.error("Lỗi khi chấp nhận yêu cầu trong Cloud Function:", error);
        throw new functions.https.HttpsError(
            'internal',
            'Đã xảy ra lỗi khi xử lý yêu cầu của bạn.',
            error.message
        );
    }
});
