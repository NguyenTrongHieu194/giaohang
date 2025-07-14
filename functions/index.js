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
    console.log("Cloud Function received data:", data);
    // Log the entire context object to inspect its structure
    // We stringify it to ensure all properties are visible in logs, even nested ones.
    console.log("Full context object:", JSON.stringify(context, null, 2)); 
    console.log("Cloud Function GCLOUD_PROJECT env var:", process.env.GCLOUD_PROJECT);
    // --- END DEBUGGING LOGS ---

    // 1. Check authentication more robustly
    // context.auth should contain the user's authentication information.
    // If it's missing or doesn't have uid/token, the user is not properly authenticated
    // for this callable function.
    if (!context.auth || !context.auth.uid || !context.auth.token) {
        console.error("Authentication context or token missing for callable function. context.auth:", context.auth);
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Người dùng chưa được xác thực hoặc token không hợp lệ.'
        );
    }

    const currentUserId = context.auth.uid;
    const userRole = context.auth.token.role; // Get the custom claim role

    // 2. Validate input data
    const { userId, collectionName, requestId, type } = data;

    if (!userId || !collectionName || !requestId || !type) {
        // Log detailed missing info for debugging
        console.error("Missing information in request data:", { userId, collectionName, requestId, type });
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
    const requestRef = db.doc(`artifacts/${app_id}/users/${userId}/${collectionName}/${requestId}`);
    console.log("Constructed Firestore path:", `artifacts/${app_id}/users/${userId}/${collectionName}/${requestId}`);


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
                    'already-exists', // Using already-exists to indicate it's taken
                    'Yêu cầu này đã được gán cho một người khác.'
                );
            }

            // If not assigned or assigned to current user (re-accepting/re-confirming)
            // Perform the update
            const updateData = {
                status: assignedStatus,
                [assignedField]: currentUserId // Use computed property name for dynamic field
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
