import axios from "axios";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";

export class AWSUploader {
  constructor(url, file, maxFileSizeForChunking, emit) {
    this.bucketName = "knowlg-public";
    this.file = file;
    this.emit = emit;
    this.chunkSize = 5242880; // 5MB chunk size
    this.currentFilePointer = 0;
    this.bytesUploaded = 0;
    this.totalBytesRemaining = this.file.size;
    this.parts = []; // To store part numbers and ETags
    this.timeStarted = new Date(); // Start time for estimation

    // Initialize AWS S3 client
    this.s3Client = new S3Client({
      region: "ap-south-1", // e.g., "us-west-1"
      credentials: {
        accessKeyId: "",
        secretAccessKey: "",
      },
    });

    this.keyPath = "";
    try {
      const parsedUrl = new URL(url);
      this.keyPath = parsedUrl.pathname.slice(1);
    } catch (error) {
      console.error("Invalid URL provided:", error);
      return;
    }

    console.log("i am in keyPath " + this.keyPath);

    this.initiateMultipartUpload(); // Start the multipart upload process
  }

  async initiateMultipartUpload() {
    try {
      // Step 1: Initiate Multipart Upload
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: this.keyPath,
        ContentType: this.file.type,
      });
      const response = await this.s3Client.send(command);

      console.log(
        "i am in initiateMultipartUpload response",
        JSON.stringify(response)
      );

      this.uploadId = response.UploadId;
      this.uploadInChunks();
    } catch (error) {
      console.log("i am in Failed to initiate multipart upload:", error);
      this.emit("i am in error", error);
    }
  }

  async uploadInChunks() {
    console.log(
      "i am in uploadInChunks totalBytesRemaining",
      this.totalBytesRemaining
    );
    while (this.totalBytesRemaining > 0) {
      const currentChunkSize = Math.min(
        this.chunkSize,
        this.totalBytesRemaining
      );
      console.log("i am in uploadInChunks currentChunkSize", currentChunkSize);
      const fileChunk = this.file.slice(
        this.currentFilePointer,
        this.currentFilePointer + currentChunkSize
      );
      console.log("i am in uploadInChunks fileChunk", fileChunk);
      const partNumber = this.parts.length + 1;
      console.log("i am in uploadInChunks partNumber", partNumber);

      try {
        // Upload each chunk as a separate part
        const eTag = await this.uploadChunk(fileChunk, partNumber);
        console.log("i am in uploadChunk eTag", eTag);
        this.parts.push({ PartNumber: partNumber, ETag: eTag });

        this.currentFilePointer += currentChunkSize;
        this.totalBytesRemaining -= currentChunkSize;
        this.bytesUploaded += currentChunkSize;

        const percentComplete = (
          (this.bytesUploaded / this.file.size) *
          100
        ).toFixed(2);
        const estimatedTime = this.getEstimatedSecondsLeft();
        this.emit("progress", { progress: percentComplete, estimatedTime });
        console.log("i am in uploadInChunks", {
          progress: percentComplete,
          estimatedTime,
        });

        if (this.totalBytesRemaining === 0) {
          await this.completeMultipartUpload();
        }
      } catch (error) {
        console.log("i am in Chunk upload error:", error);
        this.emit("error", error);
        break;
      }
    }
  }
  async uploadChunk(chunkData, partNumber) {
    const command = new UploadPartCommand({
      Bucket: this.bucketName,
      Key: this.keyPath,
      PartNumber: partNumber,
      UploadId: this.uploadId,
      Body: chunkData,
      ContentLength: chunkData.byteLength || chunkData.size, // Ensure chunk length is set
    });
    const response = await this.s3Client.send(command);

    console.log("i am in uploadChunk response", JSON.stringify(response));
    return response.ETag; // ETag is required to complete the multipart upload
  }

  async completeMultipartUpload() {
    try {
      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: this.keyPath,
        UploadId: this.uploadId,
        MultipartUpload: { Parts: this.parts },
      });
      await this.s3Client.send(command);
      this.emit("completed", { status: 200 });
    } catch (error) {
      console.error("i am in Failed to complete multipart upload:", error);
      this.emit("error", error);
    }
  }

  // Method to estimate time left based on current upload speed
  getEstimatedSecondsLeft() {
    const timeElapsed = new Date() - this.timeStarted;
    const uploadSpeed = this.bytesUploaded / (timeElapsed / 1000); // bytes per second
    const estimatedSecondsLeft =
      (this.file.size - this.bytesUploaded) / uploadSpeed;
    return Math.round(estimatedSecondsLeft);
  }
}
