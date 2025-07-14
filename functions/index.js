/**
 * Firebase Cloud Functions (v2 API) for Multi-Service App Backend
 *
 * This file contains Cloud Functions to handle various backend logic
 * for food orders, shipper requests, and ride hailing requests.
 * It uses the newer v2 API syntax for better performance and features.
 */

// Import necessary modules from Firebase Functions v2 API
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger"); // For logging

// Import Firebase Admin SDK
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK (required to interact with Firestore, Auth, FCM, etc.)
admin.initializeApp();

// Get a reference to the Firestore database
const db = admin.firestore();

// Set global options for Cloud Functions (e.g., max instances for cost control)
// This applies to v2 functions.
// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit.
// You can override the limit for each function using the `maxInstances` option
// in the function's options, e.g. `onCall({ maxInstances: 5 }, (req, res) => { ... })`.
// logger.log("Setting global options for Cloud Functions.");
// setGlobalOptions({ maxInstances: 10 }); // Uncomment if you want to set a global limit

// --- Cloud Function 1: Process New Food Order / Shipper Request / Ride Request ---
// This function is triggered whenever a new document is created in the 'orders',
// 'shipper_requests', or 'ride_requests' collections for any user.
// It automatically processes the initial state and can perform backend tasks.
exports.processNewRequest = onDocumentCreated('artifacts/{appId}/users/{userId}/{collectionName}/{documentId}', async (event) => {
    // Get the new document data
    const newRequest = event.data.data();
    const userId = event.params.userId;
    const documentId = event.params.documentId;
    const appId = event.params.appId;
    const collectionName = event.params.collectionName; // This will be 'orders', 'shipper_requests', or 'ride_requests'

    logger.info(`[Cloud Function] New document created in ${collectionName}: ${documentId} by user ${userId} in app ${appId}`);
    logger.info('Request data:', newRequest);

    // Reference to the document that triggered the function
    const docRef = db.collection(`artifacts/${appId}/users/${userId}/${collectionName}`).doc(documentId);

    try {
        // Determine the type of request and apply specific logic
        if (newRequest.type === 'food_order') {
            logger.info(`[Food Order] Processing food order for restaurant: ${newRequest.restaurantName}`);
            // Update order status to "Đang chờ nhà hàng xác nhận"
            await docRef.update({
                status: "Đang chờ nhà hàng xác nhận",
                backendProcessed: true, // Mark as processed by backend
                processedAt: admin.firestore.FieldValue.serverTimestamp() // Timestamp of processing
            });
            logger.info(`[Food Order] Updated status of order ${documentId} to "Đang chờ nhà hàng xác nhận".`);

            // TODO: Implement logic to notify the restaurant (e.g., send to a restaurant management system)
            // TODO: Implement logic to send push notification to the user via FCM
            // Example (requires FCM setup and user's FCM token):
            // admin.messaging().sendToDevice(userFCMToken, { notification: { title: "Đơn hàng của bạn", body: "Nhà hàng đã nhận đơn hàng của bạn!" } });

        } else if (newRequest.type === 'shipper_request') {
            logger.info(`[Shipper Request] Processing shipper request from ${newRequest.pickup} to ${newRequest.delivery}`);
            // Update status for shipper request
            await docRef.update({
                status: "Đang tìm shipper",
                backendProcessed: true,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            logger.info(`[Shipper Request] Updated status of request ${documentId} to "Đang tìm shipper".`);

            // TODO: Implement logic to find and assign a suitable shipper
            // TODO: Implement logic to notify available shippers
            // TODO: Calculate estimated cost if not already done on frontend
        } else if (newRequest.type === 'ride_request') {
            logger.info(`[Ride Request] Processing ride request from ${newRequest.pickup} to ${newRequest.dropoff} with vehicle type ${newRequest.vehicle}`);
            // Update status for ride request
            await docRef.update({
                status: "Đang tìm tài xế",
                backendProcessed: true,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            logger.info(`[Ride Request] Updated status of request ${documentId} to "Đang tìm tài xế".`);

            // TODO: Implement logic to find and assign a suitable driver
            // TODO: Implement logic to notify available drivers
            // TODO: Calculate estimated fare
        } else {
            logger.warn(`[Cloud Function] Unknown request type: ${newRequest.type} for document ${documentId}`);
        }

    } catch (error) {
        logger.error(`[Cloud Function] Error processing document ${documentId} in ${collectionName}:`, error);
    }
});

// --- Cloud Function 2: Callable Function Example (can be called from Frontend) ---
// This function can be invoked directly from your frontend JavaScript code
// to perform tasks that require admin privileges or complex backend logic.
exports.sayHello = onCall(async (request) => {
    // request.data: Data sent from the frontend
    // request.auth: Contains information about the caller (e.g., request.auth.uid if logged in)

    const name = request.data.name || 'Người dùng';
    const uid = request.auth ? request.auth.uid : 'ẩn danh';

    logger.info(`[Callable Function] sayHello invoked by ${uid} with name: ${name}`);

    // Return a JSON object to the frontend
    return { message: `Xin chào, ${name}! Bạn là người dùng ${uid}.` };
});