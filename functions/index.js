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
exports.acceptRequest = functions.https.onCall(async (originalData, context) => { // Đổi tên data thành originalData
    // --- START DEBUGGING LOGS ---
    console.log("Cloud Function received originalData:", originalData);
    console.log("Full context object:", JSON.stringify(context, null, 2)); 
    console.log("Cloud Function GCLOUD_PROJECT env var:", process.env.GCLOUD_PROJECT);
    console.log("Context Auth Status (for debug):", context.auth ? "Present" : "Missing");
    if (context.auth) {
        console.log("Context Auth UID (for debug):", context.auth.uid);
        console.log("Context Auth Token (role) (for debug):", context.auth.token ? context.auth.token.role : "N/A");
    }
    // --- END DEBUGGING LOGS ---

    // Lấy payload thực sự từ originalData.data
    // Nếu originalData.data không tồn tại, có thể originalData chính là payload
    const data = originalData.data || originalData; 
    console.log("Extracted payload 'data':", data);

    // 1. Lấy ID Token từ Authorization header hoặc từ data payload
    let idToken;
    if (context.rawRequest && context.rawRequest.headers && context.rawRequest.headers.authorization) {
        const authHeader = context.rawRequest.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
            idToken = authHeader.substring(7); // Lấy phần token sau 'Bearer '
            console.log("ID Token found in Authorization header. (First 20 chars):", idToken.substring(0, 20) + "...");
        }
    }

    // Fallback to data.idToken if not found in header
    // Sử dụng 'data.idToken' vì 'data' bây giờ là payload đã được trích xuất
    if (!idToken && data.idToken) { 
        idToken = data.idToken;
        console.log("ID Token found in extracted payload 'data.idToken' (fallback). (First 20 chars):", idToken.substring(0, 20) + "...");
    }

    if (!idToken) {
        console.error("ID Token missing in callable function data. (After all extraction attempts)");
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Token xác thực bị thiếu.'
        );
    }

    let decodedToken;
    try {
        // Xác minh ID Token thủ công
        decodedToken = await admin.auth().verifyIdToken(idToken);
        console.log("ID Token verified successfully. Decoded token UID:", decodedToken.uid);
        console.log("Decoded token Role:", decodedToken.role);
    } catch (error) {
        console.error("Error verifying ID Token:", error.code, error.message); 
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Token xác thực không hợp lệ hoặc đã hết hạn.',
            error.message 
        );
    }

    // Sử dụng thông tin từ decodedToken
    const currentUserId = decodedToken.uid;
    const userRole = decodedToken.role; 

    // 2. Validate input data from 'data' payload (payload đã được trích xuất)
    const userIdFromClient = data.userId; 
    const collectionName = data.collectionName;
    const requestId = data.requestId;
    const type = data.type;

    if (!userIdFromClient || !collectionName || !requestId || !type) {
        console.error("Missing information in extracted payload 'data':", { userIdFromClient, collectionName, requestId, type });
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Thiếu thông tin yêu cầu (userId, collectionName, requestId, type).'
        );
    }

    // Đảm bảo userId trong data khớp với userId từ token để tránh giả mạo
    if (userIdFromClient !== currentUserId) {
        console.error("User ID in request data does not match authenticated user ID.", { requestUserId: userIdFromClient, authenticatedUserId: currentUserId });
        throw new functions.https.HttpsError(
            'permission-denied',
            'Bạn không được phép thực hiện hành động này cho người dùng khác.'
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
                [assignedField]: currentUserId 
            };
            console.log("Updating document with data:", updateData);

            transaction.update(requestRef, updateData);
        });

        return { message: 'Yêu cầu đã được chấp nhận thành công!' };

    } catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error; 
        }
        console.error("Lỗi khi chấp nhận yêu cầu trong Cloud Function:", error);
        throw new functions.https.HttpsError(
            'internal',
            'Đã xảy ra lỗi khi xử lý yêu cầu của bạn.',
            error.message
        );
    }
});
