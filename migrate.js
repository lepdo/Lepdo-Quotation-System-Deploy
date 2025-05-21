const admin = require('firebase-admin');
const fs = require('fs').promises;
const path = require('path');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json'); // Adjust path as needed
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// File paths for JSON files
const DIAMONDS_FILE = path.join(__dirname, 'data', 'diamonds.json');
const METADATA_FILE = path.join(__dirname, 'data', 'metadata.json');
const METAL_PRICE_FILE = path.join(__dirname, 'data', 'metalPrice.json');

// Batch size limits
const DIAMONDS_BATCH_SIZE = 500;
const METADATA_BATCH_SIZE = 5;
const SUBCOLLECTION_BATCH_SIZE = 500; // For subcollection writes

// Helper function to estimate document size (in bytes)
function getDocumentSize(doc) {
    return Buffer.byteLength(JSON.stringify(doc), 'utf8');
}

// Helper function to sanitize data (remove invalid types)
function sanitizeData(obj) {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeData(item));
    }
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null) {
            result[key] = null;
        } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            result[key] = sanitizeData(value);
        } else if (typeof value !== 'function' && !Number.isNaN(value)) {
            result[key] = value;
        } else {
            console.warn(`Removing invalid value for key ${key}: ${value}`);
        }
    }
    return result;
}

// Helper function to migrate large quotation with subcollections
async function migrateLargeQuotation(quotation) {
    const docId = quotation.quotationId.toString();
    const mainDoc = sanitizeData({
        quotationId: quotation.quotationId,
        identification: quotation.identification,
        summary: quotation.summary
    });

    const mainDocSize = getDocumentSize(mainDoc);
    if (mainDocSize > 1_000_000) {
        console.warn(`Main document ${docId} still exceeds 1 MB (${mainDocSize} bytes) after removing large arrays`);
        return false;
    }

    // Write main document
    await db.collection('metadata').doc(docId).set(mainDoc);
    console.log(`Wrote main document ${docId}, size: ${mainDocSize} bytes`);

    // Write diamondItems to subcollection
    if (quotation.diamondItems && Array.isArray(quotation.diamondItems)) {
        for (let i = 0; i < quotation.diamondItems.length; i += SUBCOLLECTION_BATCH_SIZE) {
            const batch = db.batch();
            const batchItems = quotation.diamondItems.slice(i, i + SUBCOLLECTION_BATCH_SIZE);
            batchItems.forEach((item, index) => {
                const itemRef = db.collection('metadata').doc(docId).collection('diamondItems').doc(`item_${i + index}`);
                batch.set(itemRef, sanitizeData(item));
            });
            await batch.commit();
            console.log(`Wrote batch ${i / SUBCOLLECTION_BATCH_SIZE + 1} of diamondItems for ${docId} (${batchItems.length} items)`);
        }
    }

    // Write metalItems to subcollection
    if (quotation.metalItems && Array.isArray(quotation.metalItems)) {
        for (let i = 0; i < quotation.metalItems.length; i += SUBCOLLECTION_BATCH_SIZE) {
            const batch = db.batch();
            const batchItems = quotation.metalItems.slice(i, i + SUBCOLLECTION_BATCH_SIZE);
            batchItems.forEach((item, index) => {
                const itemRef = db.collection('metadata').doc(docId).collection('metalItems').doc(`item_${i + index}`);
                batch.set(itemRef, sanitizeData(item));
            });
            await batch.commit();
            console.log(`Wrote batch ${i / SUBCOLLECTION_BATCH_SIZE + 1} of metalItems for ${docId} (${batchItems.length} items)`);
        }
    }

    return true;
}

// Helper function to process data in batches
async function writeInBatches(collectionName, data, batchSize) {
    const skippedDocuments = [];
    for (let i = 0; i < data.length; i += batchSize) {
        const batch = db.batch();
        const batchData = data.slice(i, i + batchSize).filter(item => {
            const docId = collectionName === 'diamonds' ? item.id : item.quotationId;
            const size = getDocumentSize(item);
            if (size > 1_000_000 && collectionName === 'diamonds') {
                console.warn(`Skipping document ${docId} in ${collectionName}: ${size} bytes exceeds 1 MB limit`);
                skippedDocuments.push({ docId, size });
                return false;
            }
            return true;
        });

        if (batchData.length === 0) {
            console.log(`Batch ${i / batchSize + 1} of ${collectionName} is empty, skipping`);
            continue;
        }

        batchData.forEach(item => {
            if (!item.id && collectionName === 'diamonds') {
                console.warn('Skipping diamond with missing id:', item);
                return;
            }
            if (!item.quotationId && collectionName === 'metadata') {
                console.warn('Skipping quotation with missing quotationId:', item);
                return;
            }
            const docId = collectionName === 'diamonds' ? item.id.toString() : item.quotationId.toString();
            const sanitizedItem = sanitizeData(item);
            console.log(`Writing document ${docId} in ${collectionName}, size: ${getDocumentSize(sanitizedItem)} bytes`);
            if (collectionName === 'metadata' && sanitizedItem.identification) {
                console.log(`Identification field for ${docId}:`, sanitizedItem.identification);
            }
            const docRef = db.collection(collectionName).doc(docId);
            batch.set(docRef, sanitizedItem);
        });

        try {
            await batch.commit();
            console.log(`Successfully wrote batch ${i / batchSize + 1} of ${collectionName} (${batchData.length} documents)`);
        } catch (err) {
            console.error(`Error writing batch ${i / batchSize + 1} of ${collectionName}:`, err);
            throw err;
        }
    }
    if (skippedDocuments.length > 0) {
        console.log('Skipped documents due to size limit:', skippedDocuments);
    }
    return skippedDocuments;
}

// Migration function
async function migrateData() {
    try {
        // Migrate diamonds.json to diamonds collection (skip if already exists)
        let diamondsData;
        try {
            diamondsData = JSON.parse(await fs.readFile(DIAMONDS_FILE, 'utf8'));
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.log('diamonds.json not found, initializing empty diamonds collection');
                diamondsData = [];
            } else {
                throw err;
            }
        }
        if (diamondsData.length > 0) {
            console.log(`Migrating ${diamondsData.length} diamonds...`);
            const skipped = await writeInBatches('diamonds', diamondsData.filter(async item => {
                const doc = await db.collection('diamonds').doc(item.id.toString()).get();
                return !doc.exists;
            }), DIAMONDS_BATCH_SIZE);
            console.log(`Migrated ${diamondsData.length - skipped.length} diamonds to Firestore`);
        } else {
            console.log('No diamonds to migrate');
        }

        // Migrate metadata.json to metadata collection
        let metadataData;
        try {
            metadataData = JSON.parse(await fs.readFile(METADATA_FILE, 'utf8'));
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.log('metadata.json not found, initializing empty metadata collection');
                metadataData = [];
            } else {
                throw err;
            }
        }
        if (metadataData.length > 0) {
            console.log(`Migrating ${metadataData.length} quotations...`);
            let migratedCount = 0;
            const skippedDocuments = [];
            for (const quotation of metadataData) {
                const docId = quotation.quotationId.toString();
                const size = getDocumentSize(quotation);
                const existingDoc = await db.collection('metadata').doc(docId).get();
                if (existingDoc.exists) {
                    console.log(`Skipping document ${docId}: already exists`);
                    continue;
                }
                if (size > 1_000_000) {
                    console.log(`Processing large document ${docId} with subcollections: ${size} bytes`);
                    const success = await migrateLargeQuotation(quotation);
                    if (!success) {
                        skippedDocuments.push({ docId, size });
                    } else {
                        migratedCount++;
                    }
                } else {
                    const sanitizedQuotation = sanitizeData(quotation);
                    console.log(`Writing document ${docId}, size: ${getDocumentSize(sanitizedQuotation)} bytes`);
                    if (sanitizedQuotation.identification) {
                        console.log(`Identification field for ${docId}:`, sanitizedQuotation.identification);
                    }
                    await db.collection('metadata').doc(docId).set(sanitizedQuotation);
                    console.log(`Wrote document ${docId}`);
                    migratedCount++;
                }
            }
            console.log(`Migrated ${migratedCount} quotations to Firestore`);
            if (skippedDocuments.length > 0) {
                console.log('Skipped documents due to size limit:', skippedDocuments);
                console.log('Consider manually reducing these documents or using alternative storage (e.g., Cloud Storage).');
            }
        } else {
            console.log('No quotations to migrate');
        }

        // Migrate metalPrice.json to metalPrices collection (single document)
        let metalPricesData;
        try {
            metalPricesData = JSON.parse(await fs.readFile(METAL_PRICE_FILE, 'utf8'));
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.log('metalPrice.json not found, initializing empty metalPrices document');
                metalPricesData = {};
            } else {
                throw err;
            }
        }
        await db.collection('metalPrices').doc('prices').set(sanitizeData(metalPricesData));
        console.log('Migrated metal prices to Firestore');

        console.log('Data migration completed successfully');
    } catch (err) {
        console.error('Error during migration:', err);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

// Run migration
migrateData();