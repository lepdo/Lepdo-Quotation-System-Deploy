const express = require('express');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { Octokit } = require('@octokit/rest');
const sharp = require('sharp'); // Added for image compression
require('dotenv').config();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
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

// Initialize Octokit for GitHub API
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN // Removed hardcoded token for security
});

// Configure Multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Valid shapes for diamonds
const VALID_SHAPES = ['ROUND', 'OVAL', 'PEAR', 'EMERALD', 'PRINCESS', 'CUSHION'];

// Helper function to estimate document size (in bytes)
function getDocumentSize(doc) {
    return Buffer.byteLength(JSON.stringify(doc), 'utf8');
}

// Helper function to sanitize data
function sanitizeData(obj) {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(item => sanitizeData(item));
    if (typeof obj !== 'object' || obj instanceof Date) return obj;
    
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null) {
            result[key] = null;
        } else if (typeof value === 'object' && !(value instanceof Date)) {
            result[key] = sanitizeData(value);
        } else if (typeof value !== 'function' && !Number.isNaN(value)) {
            result[key] = value;
        } else {
            console.warn(`Removing invalid value for key ${key}: ${value}`);
        }
    }
    return result;
}

// Updated endpoint to handle image uploads to GitHub with compression
app.post('/api/upload-image', upload.array('images'), async (req, res) => {
    try {
        // Validate environment variables
        if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
            console.error('Missing GitHub environment variables:', {
                token: process.env.GITHUB_TOKEN ? 'Set' : 'Not Set',
                owner: process.env.GITHUB_OWNER,
                repo: process.env.GITHUB_REPO
            });
            return res.status(500).json({ error: { message: 'Server configuration error: Missing GitHub credentials' } });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: { message: 'No images provided' } });
        }

        const uploadPromises = req.files.map(async (file) => {
            const fileName = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
            const filePath = `images/${fileName}`; // Store images in an 'images' folder

            // Compress image using sharp
            let compressedBuffer;
            try {
                compressedBuffer = await sharp(file.buffer)
                    .resize({ width: 1024, withoutEnlargement: true }) // Resize to max 1024px width, don't enlarge
                    .jpeg({ quality: 80 }) // Convert to JPEG with 80% quality
                    .toBuffer();
                // console.log(`Compressed ${fileName}: Original size=${file.size} bytes, Compressed size=${compressedBuffer.length} bytes`);
            } catch (sharpErr) {
                console.error(`Error compressing image ${fileName}:`, sharpErr);
                throw new Error(`Failed to compress image: ${sharpErr.message}`);
            }

            // Convert compressed buffer to base64
            const content = compressedBuffer.toString('base64');

            // Upload file to GitHub
            try {
                const response = await octokit.repos.createOrUpdateFileContents({
                    owner: process.env.GITHUB_OWNER,
                    repo: process.env.GITHUB_REPO,
                    path: filePath,
                    message: `Upload image ${fileName}`,
                    content: content,
                    branch: 'main'
                });

                // Return raw GitHub URL
                const rawUrl = `https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/main/${filePath}`;
                return rawUrl;
            } catch (githubErr) {
                console.error(`Error uploading ${fileName} to GitHub:`, githubErr);
                if (githubErr.status === 403 && githubErr.message.includes('rate limit')) {
                    return res.status(429).json({ error: { message: 'GitHub API rate limit exceeded. Try again later.' } });
                }
                throw githubErr;
            }
        });

        const imageUrls = await Promise.all(uploadPromises);
        res.status(200).json({ imageUrls });
    } catch (err) {
        console.error('Error uploading images to GitHub:', err);
        res.status(500).json({ error: { message: 'Failed to upload images', details: err.message } });
    }
});

// Endpoint to delete images from GitHub
app.delete('/api/delete-image', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url || !url.startsWith(`https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/`)) {
            return res.status(400).json({ error: { message: 'Invalid or missing image URL' } });
        }

        // Extract file path from URL
        const filePath = url.split(`https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/main/`)[1];

        // Get the file's SHA
        const { data } = await octokit.repos.getContent({
            owner: process.env.GITHUB_OWNER,
            repo: process.env.GITHUB_REPO,
            path: filePath
        });

        // Delete the file
        await octokit.repos.deleteFile({
            owner: process.env.GITHUB_OWNER,
            repo: process.env.GITHUB_REPO,
            path: filePath,
            message: `Delete image ${filePath}`,
            sha: data.sha,
            branch: 'main'
        });

        res.status(200).json({ message: 'Image deleted successfully' });
    } catch (err) {
        console.error('Error deleting image from GitHub:', err);
        res.status(500).json({ error: { message: 'Failed to delete image', details: err.message } });
    }
});

// Get all diamonds
app.get('/api/diamonds', async (req, res) => {
    try {
        const snapshot = await db.collection('diamonds').get();
        const diamonds = snapshot.docs.map(doc => ({ id: parseInt(doc.id), ...doc.data() }));
        res.json(diamonds);
    } catch (err) {
        console.error('Error fetching diamonds:', err);
        res.status(500).json({ error: { message: 'Failed to load diamond data' } });
    }
});

// Add a new diamond
app.post('/api/diamonds', async (req, res) => {
    try {
        const newDiamond = req.body;

        if (!newDiamond.SHAPE || !VALID_SHAPES.includes(newDiamond.SHAPE) ||
            newDiamond.MM === undefined || typeof newDiamond['PRICE/CT'] !== 'number') {
            return res.status(400).json({
                error: { message: 'Invalid input: SHAPE must be one of ' + VALID_SHAPES.join(', ') + ', MM and PRICE/CT are required, and PRICE/CT must be a number' }
            });
        }

        if (newDiamond.SHAPE === 'ROUND' && typeof newDiamond.MM !== 'number') {
            return res.status(400).json({
                error: { message: 'MM must be a number for ROUND shape' }
            });
        }

        const snapshot = await db.collection('diamonds').get();
        const maxId = snapshot.empty ? 0 : Math.max(...snapshot.docs.map(doc => parseInt(doc.id)));
        newDiamond.id = maxId + 1;
        newDiamond['MM & SHAPE'] = `${newDiamond.SHAPE}-${newDiamond.MM} MM`;

        await db.collection('diamonds').doc(newDiamond.id.toString()).set(sanitizeData(newDiamond));
        res.status(201).json(newDiamond);
    } catch (err) {
        console.error('Error adding diamond:', err);
        res.status(500).json({ error: { message: 'Failed to add diamond' } });
    }
});

// Update a diamond
app.put('/api/diamonds/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const updatedDiamond = req.body;

        if (!updatedDiamond.SHAPE || !VALID_SHAPES.includes(updatedDiamond.SHAPE) ||
            updatedDiamond.MM === undefined || typeof updatedDiamond['PRICE/CT'] !== 'number') {
            return res.status(400).json({
                error: { message: 'Invalid input: SHAPE must be one of ' + VALID_SHAPES.join(', ') + ', MM and PRICE/CT are required, and PRICE/CT must be a number' }
            });
        }

        if (updatedDiamond.SHAPE === 'ROUND' && typeof updatedDiamond.MM !== 'number') {
            return res.status(400).json({
                error: { message: 'MM must be a number for ROUND shape' }
            });
        }

        const diamondRef = db.collection('diamonds').doc(id);
        const diamondDoc = await diamondRef.get();
        if (!diamondDoc.exists) {
            return res.status(404).json({ error: { message: 'Diamond not found' } });
        }

        const diamondData = {
            id: parseInt(id),
            SHAPE: updatedDiamond.SHAPE,
            MM: updatedDiamond.MM,
            'PRICE/CT': updatedDiamond['PRICE/CT'],
            'MM & SHAPE': `${updatedDiamond.SHAPE}-${updatedDiamond.MM} MM`
        };
        await diamondRef.set(sanitizeData(diamondData));

        try {
            const metadataSnapshot = await db.collection('metadata').get();
            const batch = db.batch();
            let updatedCount = 0;

            for (const doc of metadataSnapshot.docs) {
                const quotation = doc.data();
                if (quotation.storedInCloudStorage) {
                    // console.log(`Quotation ${doc.id}: Stored in Cloud Storage, skipping update`);
                    continue;
                }

                const diamondItemsSnapshot = await db.collection('metadata').doc(doc.id).collection('diamondItems').get();
                const diamondItems = diamondItemsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

                const updatedDiamondItems = diamondItems.map(item => {
                    if (item.shape.toLowerCase() === 'other' || item.mm.toLowerCase() === 'other') {
                        // console.log(`Quotation ${doc.id}: Skipping item with shape=${item.shape}, mm=${item.mm} (other)`);
                        return item;
                    }

                    if (item.shape === updatedDiamond.SHAPE && item.mm === updatedDiamond.MM) {
                        // console.log(`Match found in quotation ${doc.id}: shape=${item.shape}, mm=${item.mm}`);
                        const newPricePerCt = updatedDiamond['PRICE/CT'];
                        const newTotal = (parseFloat(item.totalWeightCt) * newPricePerCt).toFixed(2);
                        updatedCount++;
                        return {
                            ...item,
                            pricePerCt: newPricePerCt.toFixed(2),
                            total: newTotal
                        };
                    }
                    return item;
                });

                updatedDiamondItems.forEach(item => {
                    const itemRef = db.collection('metadata').doc(doc.id).collection('diamondItems').doc(item.id);
                    batch.set(itemRef, sanitizeData(item));
                });

                const totalDiamondAmount = updatedDiamondItems
                    .reduce((sum, item) => sum + parseFloat(item.total || 0), 0)
                    .toFixed(2);
                // console.log(`Quotation ${doc.id}: New totalDiamondAmount=${totalDiamondAmount}`);

                const metalSummarySnapshot = await db.collection('metadata').doc(doc.id).collection('metalSummary').get();
                const metalSummary = metalSummarySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                const updatedMetalSummary = metalSummary.map(summary => {
                    const newTotal = (
                        parseFloat(summary.totalMetal || 0) +
                        parseFloat(summary.makingCharges || 0) +
                        parseFloat(totalDiamondAmount)
                    ).toFixed(2);
                    return {
                        ...summary,
                        totalDiamondAmount: totalDiamondAmount,
                        total: newTotal
                    };
                });
                updatedMetalSummary.forEach(summary => {
                    const summaryRef = db.collection('metadata').doc(doc.id).collection('metalSummary').doc(summary.id);
                    batch.set(summaryRef, sanitizeData(summary));
                });

                const updatedQuotation = {
                    ...quotation,
                    summary: {
                        ...quotation.summary,
                        totalDiamondAmount: totalDiamondAmount
                    }
                };
                batch.set(db.collection('metadata').doc(doc.id), sanitizeData(updatedQuotation));
            }

            // console.log(`Total diamondItems updated: ${updatedCount}`);
            await batch.commit();
            // console.log('Metadata collection updated successfully');
        } catch (err) {
            console.error('Error updating metadata collection:', err);
        }

        res.json(diamondData);
    } catch (err) {
        console.error('Error updating diamond:', err);
        res.status(500).json({ error: { message: 'Failed to update diamond' } });
    }
});

// Delete a diamond
app.delete('/api/diamonds/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const diamondRef = db.collection('diamonds').doc(id);
        const diamondDoc = await diamondRef.get();
        if (!diamondDoc.exists) {
            return res.status(404).json({ error: { message: 'Diamond not found' } });
        }

        await diamondRef.delete();
        res.json({ message: 'Diamond deleted successfully' });
    } catch (err) {
        console.error('Error deleting diamond:', err);
        res.status(500).json({ error: { message: 'Failed to delete diamond' } });
    }
});

// Get all quotations
app.get('/api/metadata', async (req, res) => {
    try {
        const snapshot = await db.collection('metadata').get();
        const metadata = [];
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.storedInCloudStorage) {
                try {
                    const file = bucket.file(data.storagePath);
                    const [contents] = await file.download();
                    metadata.push(JSON.parse(contents.toString()));
                } catch (storageErr) {
                    console.error(`Error downloading quotation ${doc.id} from Cloud Storage:`, storageErr);
                    continue;
                }
            } else {
                const diamondItemsSnapshot = await db.collection('metadata').doc(doc.id).collection('diamondItems').get();
                data.diamondItems = diamondItemsSnapshot.docs.map(d => d.data());
                const metalItemsSnapshot = await db.collection('metadata').doc(doc.id).collection('metalItems').get();
                data.metalItems = metalItemsSnapshot.docs.map(d => d.data());
                const metalSummarySnapshot = await db.collection('metadata').doc(doc.id).collection('metalSummary').get();
                data.summary.metalSummary = metalSummarySnapshot.docs.map(d => d.data());
                metadata.push(data);
            }
        }
        res.json(metadata);
    } catch (err) {
        console.error('Error fetching metadata:', err);
        res.status(500).json({ error: { message: 'Failed to load metadata', details: err.message } });
    }
});

// Delete a quotation
// Delete a quotation and associated images from GitHub
app.delete('/api/metadata/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const docRef = db.collection('metadata').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: { message: 'Quotation not found' } });
        }

        const quotationData = doc.data();

        // Delete images from GitHub if they exist
        if (quotationData.identification && Array.isArray(quotationData.identification.images)) {
            const deleteImagePromises = quotationData.identification.images.map(async (url) => {
                if (!url.startsWith(`https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/`)) {
                    console.warn(`Invalid GitHub URL for image: ${url}`);
                    return;
                }

                try {
                    // Extract file path from URL
                    const filePath = url.split(`https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/main/`)[1];

                    // Get the file's SHA
                    const { data } = await octokit.repos.getContent({
                        owner: process.env.GITHUB_OWNER,
                        repo: process.env.GITHUB_REPO,
                        path: filePath
                    });

                    // Delete the file from GitHub
                    await octokit.repos.deleteFile({
                        owner: process.env.GITHUB_OWNER,
                        repo: process.env.GITHUB_REPO,
                        path: filePath,
                        message: `Delete image ${filePath} associated with quotation ${id}`,
                        sha: data.sha,
                        branch: 'main'
                    });
                    // console.log(`Successfully deleted image: ${url}`);
                } catch (err) {
                    console.error(`Error deleting image ${url} from GitHub:`, err);
                    // Continue with other deletions even if one image fails
                }
            });

            // Wait for all image deletions to complete
            await Promise.all(deleteImagePromises);
        }

        // Delete subcollections
        const subcollections = ['diamondItems', 'metalItems', 'metalSummary'];
        for (const subcollection of subcollections) {
            const snapshot = await db.collection('metadata').doc(id).collection(subcollection).get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }

        // Delete the main quotation document
        await docRef.delete();
        res.json({ message: 'Quotation and associated images deleted successfully' });
    } catch (err) {
        console.error('Error deleting quotation or images:', err);
        res.status(500).json({ error: { message: 'Failed to delete quotation or images', details: err.message } });
    }
});

// Save a quotation
app.post('/api/save-quotation', async (req, res) => {
    // console.log('--- /api/save-quotation route hit ---');
    const newQuotation = req.body;
    // console.log('Request body:', JSON.stringify(newQuotation, null, 2));

    if (!newQuotation.quotationId || !newQuotation.metalItems || !newQuotation.summary) {
        console.error('Validation failed: Missing quotationId, metalItems, or summary');
        return res.status(400).json({ 
            error: { message: 'Invalid quotation: quotationId, metalItems, and summary are required' }
        });
    }

    try {
        const docId = newQuotation.quotationId.toString();
        const docRef = db.collection('metadata').doc(docId);

        const doc = await docRef.get();
        if (doc.exists) {
            console.error(`Quotation ${docId} already exists`);
            return res.status(400).json({ error: { message: `Quotation ${docId} already exists` } });
        }

        const mainDoc = sanitizeData({
            quotationId: newQuotation.quotationId,
            identification: {
                idSku: newQuotation.identification.idSku,
                category: newQuotation.identification.category,
                images: newQuotation.identification.images
            },
            quotationDate: newQuotation.quotationDate ? new Date(newQuotation.quotationDate) : null,
            summary: {
                ...newQuotation.summary,
                metalSummary: null
            }
        });

        const mainDocSize = getDocumentSize(mainDoc);
        // console.log(`Main document size for ${docId}: ${mainDocSize} bytes`);
        if (mainDocSize > 1_000_000) {
            console.warn(`Quotation ${docId} exceeds 1 MB. Storing in Cloud Storage.`);
            const storagePath = `quotations/${docId}.json`;
            try {
                await bucket.file(storagePath).save(JSON.stringify(newQuotation), {
                    contentType: 'application/json'
                });
                await docRef.set({
                    quotationId: docId,
                    storagePath,
                    storedInCloudStorage: true
                });
                // console.log(`Stored ${docId} in Cloud Storage at ${storagePath}`);
                return res.status(200).json({ message: `Quotation ${docId} saved in Cloud Storage` });
            } catch (storageErr) {
                console.error(`Failed to save ${docId} to Cloud Storage:`, storageErr);
                return res.status(500).json({ 
                    error: { 
                        message: 'Failed to save quotation to Cloud Storage', 
                        details: storageErr.message 
                    }
                });
            }
        }

        // console.log(`Saving main document for ${docId}:`, mainDoc);
        await docRef.set(mainDoc);

        if (Array.isArray(newQuotation.metalItems) && newQuotation.metalItems.length > 0) {
            // console.log(`Saving ${newQuotation.metalItems.length} metalItems for ${docId}`);
            const batch = db.batch();
            newQuotation.metalItems.forEach((item, index) => {
                if (!item.purity || !item.grams || !item.ratePerGram) {
                    console.warn(`Invalid metalItem at index ${index}:`, item);
                    return;
                }
                const itemRef = docRef.collection('metalItems').doc(`item_${index}`);
                batch.set(itemRef, sanitizeData(item));
            });
            await batch.commit();
            // console.log(`Saved metalItems for ${docId}`);
        } else {
            console.warn(`No valid metalItems provided for ${docId}`);
        }

        if (Array.isArray(newQuotation.diamondItems) && newQuotation.diamondItems.length > 0) {
            // console.log(`Saving ${newQuotation.diamondItems.length} diamondItems for ${docId}`);
            const batch = db.batch();
            newQuotation.diamondItems.forEach((item, index) => {
                if (!item.shape || !item.mm || !item.pricePerCt || !item.totalWeightCt) {
                    console.warn(`Invalid diamondItem at index ${index}:`, item);
                    return;
                }
                const itemRef = docRef.collection('diamondItems').doc(`item_${index}`);
                batch.set(itemRef, sanitizeData(item));
            });
            await batch.commit();
            // console.log(`Saved diamondItems for ${docId}`);
        } else {
            console.warn(`No valid diamondItems provided for ${docId}`);
        }

        if (Array.isArray(newQuotation.summary?.metalSummary) && newQuotation.summary.metalSummary.length > 0) {
            // console.log(`Saving ${newQuotation.summary.metalSummary.length} metalSummary items for ${docId}`);
            const batch = db.batch();
            newQuotation.summary.metalSummary.forEach((item, index) => {
                if (!item.purity || !item.grams || !item.ratePerGram) {
                    console.warn(`Invalid metalSummary item at index ${index}:`, item);
                    return;
                }
                const itemRef = docRef.collection('metalSummary').doc(`item_${index}`);
                batch.set(itemRef, sanitizeData(item));
            });
            await batch.commit();
            // console.log(`Saved metalSummary for ${docId}`);
        } else {
            console.warn(`No valid metalSummary provided for ${docId}`);
        }

        // console.log(`Quotation ${docId} saved successfully`);
        return res.status(200).json({ message: `Quotation ${docId} saved successfully` });
    } catch (err) {
        console.error('Error saving quotation:', err);
        return res.status(500).json({ error: { message: 'Failed to save quotation', details: err.message } });
    }
});

// Get metal prices
app.get('/api/prices', async (req, res) => {
    try {
        const doc = await db.collection('metalPrices').doc('prices').get();
        if (!doc.exists) {
            return res.status(404).json({ error: { message: 'Prices not found' } });
        }
        res.json(doc.data());
    } catch (err) {
        console.error('Error fetching prices:', err);
        res.status(500).json({ error: { message: 'Error reading prices', details: err.message } });
    }
});

// Update metal prices
app.post('/api/prices', async (req, res) => {
    try {
        const newPrices = req.body;

        if (!newPrices || typeof newPrices !== 'object') {
            return res.status(400).json({
                error: { message: 'Invalid input: newPrices must be an object' }
            });
        }

        await db.collection('metalPrices').doc('prices').set(sanitizeData(newPrices));

        const metadataSnapshot = await db.collection('metadata').get();
        const batch = db.batch();

        for (const doc of metadataSnapshot.docs) {
            const quotation = doc.data();
            if (quotation.storedInCloudStorage) {
                // console.log(`Quotation ${doc.id}: Stored in Cloud Storage, skipping update`);
                continue;
            }

            const metalItemsSnapshot = await db.collection('metadata').doc(doc.id).collection('metalItems').get();
            const metalItems = metalItemsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const updatedMetalItems = metalItems.map(metal => {
                const newRate = newPrices[metal.purity];
                if (!newRate) {
                    throw new Error(`Price for ${metal.purity} not found in metalPrice`);
                }
                const newTotalMetal = (parseFloat(metal.grams) * parseFloat(newRate)).toFixed(2);
                const newTotal = (parseFloat(newTotalMetal) + parseFloat(metal.makingCharges || 0)).toFixed(2);
                return {
                    ...metal,
                    ratePerGram: newRate.toFixed(2),
                    totalMetal: newTotalMetal,
                    total: newTotal
                };
            });
            updatedMetalItems.forEach(metal => {
                const itemRef = db.collection('metadata').doc(doc.id).collection('metalItems').doc(metal.id);
                batch.set(itemRef, sanitizeData(metal));
            });

            const metalSummarySnapshot = await db.collection('metadata').doc(doc.id).collection('metalSummary').get();
            const metalSummary = metalSummarySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const updatedMetalSummary = metalSummary.map(summary => {
                const newRate = newPrices[summary.purity];
                if (!newRate) {
                    throw new Error(`Price for ${summary.purity} not found in metalPrice`);
                }
                const newTotalMetal = (parseFloat(summary.grams) * parseFloat(newRate)).toFixed(2);
                const newTotal = (
                    parseFloat(newTotalMetal) +
                    parseFloat(summary.makingCharges || 0) +
                    parseFloat(summary.totalDiamondAmount || 0)
                ).toFixed(2);
                return {
                    ...summary,
                    ratePerGram: newRate.toFixed(2),
                    totalMetal: newTotalMetal,
                    total: newTotal
                };
            });
            updatedMetalSummary.forEach(summary => {
                const summaryRef = db.collection('metadata').doc(doc.id).collection('metalSummary').doc(summary.id);
                batch.set(summaryRef, sanitizeData(summary));
            });

            batch.set(db.collection('metadata').doc(doc.id), sanitizeData(quotation));
        }

        await batch.commit();
        res.json({ message: 'Prices and metadata updated successfully' });
    } catch (err) {
        console.error('Error updating prices and metadata:', err);
        res.status(500).json({ error: { message: 'Error updating prices and metadata', details: err.message } });
    }
});

// Serve frontend
app.get(/^(?!\/api).*/, (req, res) => {
    if (req.accepts('html')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
        return;
    }
    res.status(404).json({ error: { message: 'Resource not found' } });
});

// Start the server
app.listen(PORT, async () => {
    try {
        console.log(`Server is running on http://localhost:${PORT}`);
        // console.log('Ensure this message appears after every server restart.');
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
});