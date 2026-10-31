/**
 * CRYPTOGRAPHY CASE STUDY - TASK 1
 * Proof of Concept: Certificate Hash Verification System
 * 
 * This script demonstrates how a company can issue a certificate, 
 * store ONLY its cryptographic hash, and later verify the authenticity 
 * of an uploaded certificate. It also simulates a real-world forgery
 * by modifying the raw text streams inside a PDF file.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFRawStream, PDFName, StandardFonts, rgb } = require("pdf-lib");
const pako = require("pako");

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// PROGRESS BAR FUNCTION

async function showProgressBar(durationMs) {
    const steps = 50;
    const stepTime = durationMs / steps;
    
    for (let i = 0; i <= steps; i++) {
        const filled = "█".repeat(i);
        const empty = "-".repeat(steps - i);
        process.stdout.write(`\r[${filled}${empty}]`);
        await wait(stepTime);
    }

    // Erase printed progress bar
    process.stdout.clearLine(0); 
    // Bring cursor back to the beginning of the line
    process.stdout.cursorTo(0);
}

// SYSTEM CONFIGURATION

const SECRET_SALT = "IU_University_Secret_Salt_2026"; 
const DB_FILE = path.join(__dirname, "database.txt");


// CORE CRYPTOGRAPHIC FUNCTIONS

function computeHashWithSalt(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const saltBuffer = Buffer.from(SECRET_SALT);
    const dataWithSalt = Buffer.concat([fileBuffer, saltBuffer]);

    const hashSum = crypto.createHash("sha256");
    hashSum.update(dataWithSalt);
    return hashSum.digest("hex");
}

function issueCertificate(filePath) {
    try {
        const hash = computeHashWithSalt(filePath);
        fs.appendFileSync(DB_FILE, hash + "\n");
        console.log(`[ISSUANCE] SUCCESS. Hash generated and saved to DB: ${hash}`);
    } catch (error) {
        console.error(`[ISSUANCE ERROR] Could not process file: ${error.message}\n`);
    }
}

function verifyCertificate(uploadedFilePath) {
    console.log(`[VERIFICATION] Checking uploaded certificate: ${uploadedFilePath}`);
    try {
        const uploadedHash = computeHashWithSalt(uploadedFilePath);
        console.log(`[VERIFICATION] Computed Hash: ${uploadedHash}`);

        if (!fs.existsSync(DB_FILE)) {
            console.log("[VERIFICATION] Database is empty. Result: INVALID.\n");
            return false;
        }

        const dbContent = fs.readFileSync(DB_FILE, "utf-8");
        const validHashes = dbContent.split("\n").map(line => line.trim()).filter(line => line.length > 0);

        if (validHashes.includes(uploadedHash)) {
            console.log("[VERIFICATION] MATCH FOUND! The certificate is VALID AND AUTHENTIC.");
            return true;
        } else {
            console.log("[VERIFICATION] NO MATCH! The certificate is INVALID OR FORGED.");
            return false;
        }
    } catch (error) {
        console.error(`[VERIFICATION ERROR] Could not verify file: ${error.message}`);
        return false;
    }
}


// PDF FORGERY FUNCTION

/**
 * Simulates an adversary tampering with an authentic digital certificate.
 *
 * CRYPTOGRAPHIC & FORMAT ANALYSIS:
 * 1. Text Representation & Kerning in PDF Streams:
 *    {See Appendix A of the related Case Study}
 *
 * 2. The Font Subsetting Obstacle:
 *    {See Appendix A of the related Case Study}
 *
 * 3. Adversarial Countermeasure (Hybrid Forgery):
 *    {See Appendix A of the related Case Study}
 *
 * 4. Cryptographic Consequence:
 *    {See Appendix A of the related Case Study}
 */
async function forgeCertificate(inputFile, outputFile, oldText, newText) {
    // Read the authentic PDF binary into memory and parse its low-level DOM structure
    const pdfBytes = fs.readFileSync(inputFile);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // STEP 1: NEUTRALISE THE ORIGINAL NAME IN THE RAW CONTENT STREAM
    // Iterate over document pages to locate and inspect the underlying content streams
    for (const page of pdfDoc.getPages()) {
        const contentsRef = page.node.get(PDFName.of("Contents"));
        const stream = pdfDoc.context.lookup(contentsRef);

        // Ensure the contents object is a valid raw PDF stream before processing
        if (!(stream instanceof PDFRawStream)) continue;

        // This document was compressed using FlateDecode (zlib/DEFLATE) {See Appendix A of the related Case Study}.
        // Decompress the raw bytes to expose the human-readable PDF graphic operators, and save a copy.
        let decoded;
        try {
            decoded = pako.inflate(stream.contents);
            // Export PDF content stream (for demonstration purposes only; it contains "[(Hannah )17(Jarvis)] TJ")
            fs.writeFileSync("original_hannah_jarvis_content_stream.txt", Buffer.from(decoded));
        } catch {
            decoded = stream.contents; // Fallback if stream is uncompressed (but we know our PDF is compressed)
        }

        let text = Buffer.from(decoded).toString("latin1");

        // Regex targeting the kerning array "[(Hannah )17(Jarvis)] TJ".
        // We replace this operator with an empty string "() Tj" rather than deleting it entirely,
        // thereby preserving the PDF graphics state machine while erasing visual output.
        const pattern = /\[\s*\(\s*Hannah\s*\)\s*\d*\s*\(\s*Jarvis\s*\)\s*\]\s*TJ/g;
        if (pattern.test(text)) {
            text = text.replace(pattern, "() Tj");

            // Re-compress the sanitised operator stream using "deflate"
            const recompressed = pako.deflate(Buffer.from(text, "latin1"));
            stream.contents = recompressed;

            // Update the stream's "Length" attribute to reflect the new byte size
            stream.dict.set(PDFName.of("Length"), pdfDoc.context.obj(recompressed.length));
        }
    }

    // STEP 2: INJECT A COMPLETE FONT AND DRAW THE FORGED IDENTITY
    // Because the embedded font subset lacks glyphs for "t", "u", etc.,
    // we embed a complete standard font (Helvetica-Bold) supported across all PDF viewers.
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const firstPage = pdfDoc.getPages()[0];

    // Render the replacement name ("Jatau Yousra") using the exact positional,
    // typographic, and chromatic parameters extracted from the original PDF {See Appendix A of the related Case Study}:
    // - Matrix coordinates: x = 294.94, y = 337.06 (from original '1 0 0 1 294.94 337.06 Tm')
    // - Font size: 55pt (matching original '/F1 60.96 Tf' visual scale)
    // - Chromatic profile: RGB(0, 0.42, 0.839) (matching original '0 0.42 0.839 rg')
    firstPage.drawText(newText, {
        x: 294.94,
        y: 337.06,
        size: 55,
        font: font,
        color: rgb(0, 0.42, 0.839),
    });

    // STEP 3: RE-SERIALISE DOCUMENT AND WRITE TO DISK
    // Serialising the altered document reorganises object cross-references and metadata.
    // This binary mutation ensures the computed SHA-256 hash will diverge from the original document.
    const outBytes = await pdfDoc.save();
    fs.writeFileSync(outputFile, outBytes);
}


// DEMONSTRATION RUN

async function main() {
    // 1. Ensure the database is clean before the test
    if (fs.existsSync(DB_FILE)) {
        fs.unlinkSync(DB_FILE); 
    }

    console.log("-----> STARTING CRYPTOGRAPHY PROOF OF CONCEPT <-----");
    await showProgressBar(1000);

    const originalFile = "original_hannah_jarvis.pdf";
    const forgedFile = "forged_jatau_yousra.pdf";

    if (!fs.existsSync(originalFile)) {
        console.error(`ERROR: Please place the original \"${originalFile}\" in the folder before running.`);
        process.exit(1);
    }

    // Step 1: The company issues the legitimate certificate
    console.log(`\n[ISSUANCE] Processing new certificate: ${originalFile}`);
    await showProgressBar(3000);
    issueCertificate(originalFile);

    // Step 2: The employer verifies the exact same, untouched certificate
    console.log("\n-> Employer is verifying the legitimate certificate...");
    await showProgressBar(4000);
    verifyCertificate(originalFile);

    console.log("\n----------------------------------------------------\n----------------------------------------------------");

    // Step 3: An attacker modifies the certificate PDF
    console.log("\n-> Attacker is forging the certificate (changing \"Hannah Jarvis\" to \"Jatau Yousra\")...");
    await showProgressBar(6000);
    await forgeCertificate(originalFile, forgedFile, "Hannah Jarvis", "Jatau Yousra");
    console.log(`-> Forged file successfully created: ${forgedFile}\n`);

    // Step 4: Employer tries to verify the forged certificate
    console.log("-> Employer is verifying the FORGED certificate...");
    await showProgressBar(4000);
    verifyCertificate(forgedFile);
}

// Execute the script
main();