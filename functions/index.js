const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

/**
 * Callable function to manually trigger a WhatsApp push notification to a specific worker.
 * Must be called by an authenticated Admin.
 */
exports.sendWhatsAppPush = functions.region('europe-west3').https.onCall(async (data, context) => {
    // 1. Verify Authentication & Authorization
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in to call this function.");
    }

    const callerId = context.auth.uid;
    const callerRef = admin.firestore().collection("users").doc(callerId);
    const callerSnap = await callerRef.get();

    if (!callerSnap.exists || callerSnap.data().userType !== "admin") {
        throw new functions.https.HttpsError("permission-denied", "Only administrators can send manual WhatsApp messages.");
    }

    // 2. Extract Data from Request
    const { jobId, workerId } = data;
    if (!jobId || !workerId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing jobId or workerId in the request.");
    }

    try {
        // 3. Fetch Worker & Job details
        const workerSnap = await admin.firestore().collection("users").doc(workerId).get();
        if (!workerSnap.exists) {
            throw new functions.https.HttpsError("not-found", "Worker not found.");
        }
        
        const jobSnap = await admin.firestore().collection("jobRequests").doc(jobId).get();
        if (!jobSnap.exists) {
            throw new functions.https.HttpsError("not-found", "Job request not found.");
        }

        const workerData = workerSnap.data();
        const jobData = jobSnap.data();

        // 4. Validate Worker constraints
        if (workerData.whatsapp !== "yes") {
            throw new functions.https.HttpsError("failed-precondition", "Worker has not opted in to WhatsApp notifications.");
        }

        const rawPhone = workerData.employeePhone;
        if (!rawPhone) {
            throw new functions.https.HttpsError("failed-precondition", "Worker does not have a valid phone number.");
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
        
        console.log(`[DEBUG] Attempting to send WhatsApp message`);
        console.log(`[DEBUG] PHONE_NUMBER_ID: ${PHONE_NUMBER_ID}`);
        console.log(`[DEBUG] Destination Phone: ${formattedPhone}`);
        console.log(`[DEBUG] META_ACCESS_TOKEN starts with: ${META_ACCESS_TOKEN.substring(0, 10)}...`);

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
                        code: process.env.TEMPLATE_LANGUAGE || "en"
                    },
                    components: [
                        {
                            type: "body",
                            parameters: [
                                {
                                    type: "text",
                                    text: jobData.restaurantName || "Bir restoran"
                                },
                                {
                                    type: "text",
                                    text: jobData.jobRole || "yeni bir pozisyon"
                                },
                                {
                                    type: "text",
                                    text: "https://vardiyan-team.web.app"
                                }
                            ]
                        }
                    ]
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
        
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError("internal", "An error occurred while sending the message. Check logs for details.");
    }
});

/**
 * Callable function for Admin Debug Impersonation.
 * Accepts a target email or UID, finds/verifies the user, and generates a Firebase Custom Auth Token.
 * Allows Admin to securely switch sessions to any target user for debugging.
 */
exports.createCustomSession = functions.region('europe-west3').https.onCall(async (data, context) => {
    // 1. Verify Authentication & Admin Role
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Yönetici girişi yapmalısınız.");
    }

    const callerId = context.auth.uid;
    const callerSnap = await admin.firestore().collection("users").doc(callerId).get();

    if (!callerSnap.exists || callerSnap.data().userType !== "admin") {
        throw new functions.https.HttpsError("permission-denied", "Bu işlem sadece Yönetici (Admin) yetkisiyle gerçekleştirilebilir.");
    }

    const { targetEmail, targetUid } = data;
    if (!targetEmail && !targetUid) {
        throw new functions.https.HttpsError("invalid-argument", "Lütfen bir e-posta adresi veya kullanıcı ID'si belirtin.");
    }

    let uidToImpersonate = targetUid;
    let targetUserData = null;

    if (!uidToImpersonate && targetEmail) {
        const cleanEmail = targetEmail.trim().toLowerCase();
        try {
            const userRecord = await admin.auth().getUserByEmail(cleanEmail);
            uidToImpersonate = userRecord.uid;
        } catch (emailErr) {
            // Fallback: search firestore users collection by email
            const usersQ = await admin.firestore().collection("users")
                .where("email", "==", cleanEmail)
                .get();
            if (!usersQ.empty) {
                uidToImpersonate = usersQ.docs[0].id;
                targetUserData = usersQ.docs[0].data();
            } else {
                throw new functions.https.HttpsError("not-found", `'${targetEmail}' e-posta adresine ait bir kullanıcı bulunamadı.`);
            }
        }
    }

    if (!targetUserData && uidToImpersonate) {
        const docSnap = await admin.firestore().collection("users").doc(uidToImpersonate).get();
        if (docSnap.exists) {
            targetUserData = docSnap.data();
        }
    }

    try {
        // Mint custom token with Firebase Admin SDK
        const customToken = await admin.auth().createCustomToken(uidToImpersonate, {
            debugImpersonatedByAdmin: true
        });

        console.log(`[ADMIN IMPERSONATION] Admin UID '${callerId}' generated custom session token for User UID '${uidToImpersonate}' (${targetEmail || targetUserData?.email || 'N/A'})`);

        return {
            success: true,
            customToken,
            targetUid: uidToImpersonate,
            targetEmail: targetEmail || targetUserData?.email || '',
            userType: targetUserData?.userType || 'unknown',
            displayName: targetUserData?.employeeName || targetUserData?.businessName || targetUserData?.authorizedName || 'Kullanıcı'
        };
    } catch (err) {
        console.error("Error creating custom token:", err);
        throw new functions.https.HttpsError("internal", "Oturum jetonu üretilirken hata oluştu: " + err.message);
    }
});

/**
 * Callable function for Admin to toggle Vardiyan (Shift / Gözcü) feature subscription.
 * Sets isSubscribed: true/false for a specified target UID in Firestore.
 */
exports.setVardiyanSubscription = functions.region('europe-west3').https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Yönetici girişi yapmalısınız.");
    }

    const callerId = context.auth.uid;
    const callerSnap = await admin.firestore().collection("users").doc(callerId).get();

    if (!callerSnap.exists || callerSnap.data().userType !== "admin") {
        throw new functions.https.HttpsError("permission-denied", "Bu işlem sadece Yönetici (Admin) yetkisiyle gerçekleştirilebilir.");
    }

    const { targetUid, isSubscribed } = data;
    if (!targetUid) {
        throw new functions.https.HttpsError("invalid-argument", "Hedef kullanıcı ID (targetUid) belirtilmelidir.");
    }

    const userRef = admin.firestore().collection("users").doc(targetUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        throw new functions.https.HttpsError("not-found", `'${targetUid}' ID'li kullanıcı bulunamadı.`);
    }

    const newSubStatus = isSubscribed !== undefined ? Boolean(isSubscribed) : true;

    await userRef.update({
        isSubscribed: newSubStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[ADMIN SET SUBSCRIPTION] Admin '${callerId}' set isSubscribed: ${newSubStatus} for user '${targetUid}'`);

    return {
        success: true,
        message: `Mirket özelliği '${targetUid}' kullanıcısı için ${newSubStatus ? 'AKTİFLEŞTİRİLDİ' : 'DEVRE DIŞI BIRAKILDI'}.`,
        targetUid,
        isSubscribed: newSubStatus
    };
});

/**
 * Trigger to automatically send a WhatsApp notification when a new shift is assigned to a worker.
 */
exports.onShiftAssigned = functions.region('europe-west3').firestore.document('shifts/{shiftId}').onWrite(async (change, context) => {
    const afterData = change.after.data();
    const beforeData = change.before ? change.before.data() : null;

    if (!change.after.exists || !afterData) return null; // Shift was deleted

    const oldStaffId = beforeData ? beforeData.staffId : null;
    const newStaffId = afterData.staffId;

    // Only trigger if staffId was newly assigned
    if (!newStaffId || oldStaffId === newStaffId) return null;

    const restaurantId = afterData.restaurantId;
    if (!restaurantId) return null;

    try {
        // Check if restaurant has toggle ON
        const restaurantRef = admin.firestore().collection('users').doc(restaurantId);
        const restaurantSnap = await restaurantRef.get();
        if (!restaurantSnap.exists) return null;
        
        const restaurantData = restaurantSnap.data();
        if (restaurantData.whatsappShiftNotifications !== true) {
            console.log(`WhatsApp notifications disabled for restaurant ${restaurantId}`);
            return null;
        }
        
        const restaurantName = restaurantData.businessName || "İşletme";

        // Get staff phone
        const staffRef = admin.firestore().collection('restaurantStaff').doc(newStaffId);
        const staffSnap = await staffRef.get();
        if (!staffSnap.exists) return null;

        const staffData = staffSnap.data();
        const phone = staffData.phone;
        if (!phone) {
            console.log(`Staff ${newStaffId} has no phone number.`);
            return null;
        }

        // Format phone
        let formattedPhone = phone.replace(/\D/g, "");
        if (formattedPhone.length === 10 && formattedPhone.startsWith("5")) {
            formattedPhone = "90" + formattedPhone;
        } else if (formattedPhone.startsWith("0")) {
            formattedPhone = "90" + formattedPhone.substring(1);
        }

        const staffName = staffData.name || "Çalışan";
        const date = afterData.date || ""; 
        const startTime = afterData.startTime || "";
        const endTime = afterData.endTime || "";

        // Send WhatsApp Push
        const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
        const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
        const TEMPLATE_NAME = process.env.TEMPLATE_NAME;

        await axios.post(
            `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: formattedPhone,
                type: "template",
                template: {
                    name: TEMPLATE_NAME,
                    language: {
                        code: process.env.TEMPLATE_LANGUAGE || "en"
                    },
                    components: [
                        {
                            type: "header",
                            parameters: [
                                {
                                    type: "text",
                                    text: "Vardiya Bilgilendirmesi"
                                }
                            ]
                        },
                        {
                            type: "body",
                            parameters: [
                                { type: "text", text: staffName },
                                { type: "text", text: date },
                                { type: "text", text: startTime },
                                { type: "text", text: endTime },
                                { type: "text", text: restaurantName }
                            ]
                        }
                    ]
                }
            },
            {
                headers: {
                    "Authorization": `Bearer ${META_ACCESS_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );
        console.log(`Sent WhatsApp shift notification to ${formattedPhone}`);
    } catch (error) {
        console.error("WhatsApp error in onShiftAssigned:", error.response?.data || error.message);
    }
    
    return null;
});

