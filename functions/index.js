const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

// Set global options, e.g., max instances, region
setGlobalOptions({ region: "europe-west3" });

/**
 * Callable function to manually trigger a WhatsApp push notification to a specific worker.
 * Must be called by an authenticated Admin.
 */
exports.sendManualWhatsAppPush = onCall(async (request) => {
    // 1. Verify Authentication & Authorization
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to call this function.");
    }

    const callerId = request.auth.uid;
    const callerRef = admin.firestore().collection("users").doc(callerId);
    const callerSnap = await callerRef.get();

    if (!callerSnap.exists || callerSnap.data().userType !== "admin") {
        throw new HttpsError("permission-denied", "Only administrators can send manual WhatsApp messages.");
    }

    // 2. Extract Data from Request
    const { jobId, workerId } = request.data;
    if (!jobId || !workerId) {
        throw new HttpsError("invalid-argument", "Missing jobId or workerId in the request.");
    }

    try {
        // 3. Fetch Worker & Job details
        const workerSnap = await admin.firestore().collection("users").doc(workerId).get();
        if (!workerSnap.exists) {
            throw new HttpsError("not-found", "Worker not found.");
        }
        
        const jobSnap = await admin.firestore().collection("jobRequests").doc(jobId).get();
        if (!jobSnap.exists) {
            throw new HttpsError("not-found", "Job request not found.");
        }

        const workerData = workerSnap.data();
        const jobData = jobSnap.data();

        // 4. Validate Worker constraints
        if (workerData.whatsapp !== "yes") {
            throw new HttpsError("failed-precondition", "Worker has not opted in to WhatsApp notifications.");
        }

        const rawPhone = workerData.employeePhone;
        if (!rawPhone) {
            throw new HttpsError("failed-precondition", "Worker does not have a valid phone number.");
        }

        // Format phone to E.164 without '+'
        let formattedPhone = rawPhone.replace(/\D/g, "");
        if (formattedPhone.length === 10) {
            formattedPhone = "90" + formattedPhone;
        } else if (formattedPhone.startsWith("0")) {
            formattedPhone = "90" + formattedPhone.substring(1);
        }

        // 5. Configuration for Meta WhatsApp API.
        const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "YOUR_META_ACCESS_TOKEN";
        const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "YOUR_PHONE_NUMBER_ID";
        const TEMPLATE_NAME = process.env.TEMPLATE_NAME || "yeni_is_firsati";

        // 6. Send WhatsApp Message via Meta API
        await axios.post(
            `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: formattedPhone,
                type: "template",
                template: {
                    name: TEMPLATE_NAME,
                    language: {
                        code: "tr"
                    }
                }
            },
            {
                headers: {
                    "Authorization": `Bearer ${META_ACCESS_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log(`Successfully sent manual WhatsApp message to ${formattedPhone} for job ${jobId}`);
        return { success: true, message: "WhatsApp mesajı başarıyla gönderildi." };

    } catch (error) {
        console.error("Error processing manual WhatsApp push:", error.response?.data || error.message);
        
        if (error instanceof HttpsError) {
            throw error;
        }

        throw new HttpsError("internal", "An error occurred while sending the message. Check logs for details.");
    }
});
