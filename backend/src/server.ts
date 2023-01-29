import express, { Request } from "express";
import * as fs from "fs-extra";
import * as path from "path";
import cors from "cors";
import { IAsset } from "./lib/asset";
import { Readable } from "stream";
import { ObjectId, Db } from "mongodb";

//
// Starts the REST API.
//
export function createServer(db: Db) {
    const assetCollections = db.collection<IAsset>("assets");

    const app = express();
    app.use(cors());

    //
    // Gets the value of a header from the request.
    // Throws an error if the header is not present.
    //
    function getHeader(req: Request, name: string): string {
        const value = req.headers[name] as string;
        if (!value) {
            throw new Error(`Expected header ${name}`);
        }

        return value;
    }

    //
    // Gets a header that is expected to be an integer value.
    // Throws an error if the value doesn't parse.
    //
    function getIntHeader(req: Request, name: string): number {
        const value = parseInt(getHeader(req, name));
        if (Number.isNaN(value)) {
            throw new Error(`Failed to parse int header ${name}`);
        }
        return value;
    }

    app.post("/asset", async (req, res) => {

        const assetId = new ObjectId();
        const fileName = getHeader(req, "file-name");
        const contentType = getHeader(req, "content-type");
        const width = getIntHeader(req, "width");
        const height = getIntHeader(req, "height");
        const hash = getHeader(req, "hash");
        
        const uploadsDirectory = path.join(__dirname, "../uploads");
        await fs.ensureDir(uploadsDirectory);
        const localFileName = path.join(uploadsDirectory, assetId.toString());

        await streamToStorage(localFileName, req);

        await assetCollections.insertOne({
            _id: assetId,
            origFileName: fileName as string,
            contentType: contentType!,
            src: `/asset?id=${assetId}`,
            thumb: `/asset?id=${assetId}`,
            width: width,
            height: height,
            hash: hash as string,
        });

        res.json({
            assetId: assetId,
        });
    });

    app.get("/asset", async (req, res) => {

        const assetId = req.query.id as string;
        if (!assetId) {
            throw new Error(`Asset ID not specified in query parameters.`);
        }
        const localFileName = path.join(__dirname, "../uploads", assetId);
        const asset = await assetCollections.findOne({ _id: new ObjectId(assetId) });
        if (!asset) {
            res.sendStatus(404);
            return;
        }

        res.writeHead(200, {
            "Content-Type": asset.contentType,
        });

        const fileReadStream = fs.createReadStream(localFileName);
        fileReadStream.pipe(res);
    });

    app.get("/check-asset", async (req, res) => {

        const hash = req.query.hash as string;
        if (!hash) {
            throw new Error(`Hash not specified in query parameters.`);
        }
        const asset = await assetCollections.findOne({ hash: hash });
        if (asset) {
            res.sendStatus(200);
        }
        else {
            res.sendStatus(404);
        }
    });

    app.get("/assets", async (req, res) => {

        const assets = await assetCollections.find({}).toArray();
        res.json({
            assets: assets,
        });
    });

    return app;
}

//
// Streams an input stream to local file storage.
//
function streamToStorage(localFileName: string, inputStream: Readable) {
    return new Promise<void>((resolve, reject) => {
        const fileWriteStream = fs.createWriteStream(localFileName);
        inputStream.pipe(fileWriteStream)
            .on("error", (err: any) => {
                reject(err);
            })
            .on("finish", () => {
                resolve();
            });
    });
}