const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

// Construct service account credentials from environment variables
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'lepdo-793ba.appspot.com'
});

const db = admin.firestore();

// Initialize Cloud Storage
const storage = new Storage({
    credentials: serviceAccount,
    projectId: serviceAccount.project_id
});
const bucket = storage.bucket('lepdo-793ba.appspot.com');

async function normalizeData() {
    const batch = db.batch();

    // Normalize diamonds
    const diamondSnapshot = await db.collection('diamonds').get();
    for (const doc of diamondSnapshot.docs) {
        const data = doc.data();
        const normalizedShape = data.SHAPE.trim().toUpperCase();
        if (normalizedShape !== data.SHAPE) {
            batch.update(doc.ref, { SHAPE: normalizedShape });
        }
    }

    // Normalize metadata
    const metadataSnapshot = await db.collection('metadata').get();
    for (const doc of metadataSnapshot.docs) {
        const quotation = doc.data();
        if (quotation.storedInCloudStorage) {
            try {
                const file = bucket.file(quotation.storagePath);
                const [contents] = await file.download();
                const metadata = JSON.parse(contents.toString());
                let updated = false;

                if (Array.isArray(metadata.diamondItems)) {
                    metadata.diamondItems.forEach(item => {
                        if (item.shape) {
                            const normalizedShape = item.shape.trim().toUpperCase();
                            if (normalizedShape !== item.shape) {
                                item.shape = normalizedShape;
                                updated = true;
                            }
                        }
                    });
                }

                if (updated) {
                    await bucket.file(quotation.storagePath).save(JSON.stringify(metadata), {
                        contentType: 'application/json'
                    });
                }
            } catch (storageErr) {
                console.error(`Error normalizing Cloud Storage metadata ${doc.id}:`, storageErr);
            }
        } else {
            const diamondItemsSnapshot = await db.collection('metadata').doc(doc.id).collection('diamondItems').get();
            diamondItemsSnapshot.docs.forEach(itemDoc => {
                const item = itemDoc.data();
                const normalizedShape = item.shape.trim().toUpperCase();
                if (normalizedShape !== item.shape) {
                    batch.update(itemDoc.ref, { shape: normalizedShape });
                }
            });
        }
    }

    await batch.commit();
    console.log('Data normalization complete');
}

normalizeData().catch(console.error);