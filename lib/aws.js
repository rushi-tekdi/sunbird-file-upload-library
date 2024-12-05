import axios from "axios";

export class AWSUploader {
  constructor(url, file, maxFileSizeForChunking, emit) {
    this.file = file;
    this.emit = emit;
    this.chunkSize = 5242880; // 5MB chunk size
    this.currentFilePointer = 0;
    this.bytesUploaded = 0;
    this.totalBytesRemaining = this.file.size;
    this.parts = []; // To store part numbers and ETags
    this.timeStarted = new Date(); // Start time for estimation

    this.keyPath = "";
    this.uploadId = "";
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
      let data = JSON.stringify({
        keyPath: this.keyPath,
        type: this.file.type,
      });
      let config = {
        method: "post",
        maxBodyLength: Infinity,
        url: "/api/multipart-upload/get-upload-id",
        headers: {
          "Content-Type": "application/json",
        },
        data: data,
      };
      await axios
        .request(config)
        .then((response) => {
          console.log(
            "i am in initiateMultipartUpload response",
            JSON.stringify(response.data)
          );
          if (response.data?.uploadId) {
            this.uploadId = response.data.uploadId;
            console.log("i am in this.uploadId", this.uploadId);
            this.uploadInChunks();
          } else {
            console.log("i am in this.uploadId error", this.uploadId);
            this.emit("i am in error", "uploadId not Found");
          }
        })
        .catch((error) => {
          console.log("i am in Failed to initiate multipart upload:", error);
          this.emit("i am in error", error);
        });
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
    console.log("i am in this.uploadId 2", this.uploadId);

    const config = {
      method: "put", // Use PUT for uploading part to S3
      maxBodyLength: Infinity, // Ensure large payloads are supported
      url: "/api/multipart-upload/upload-part-command", // Your endpoint
      headers: {
        "Content-Type": "application/octet-stream", // For binary data
        Key: this.keyPath,
        PartNumber: partNumber,
        UploadId: this.uploadId,
        ContentLength: chunkData.byteLength || chunkData.size,
      },
      data: chunkData, // Directly pass binary data
    };

    try {
      const response = await axios.request(config);
      console.log(
        "i am in uploadChunk response",
        JSON.stringify(response.data)
      );

      if (response.data?.response) {
        const response_etag = response.data.response;
        console.log(
          "i am in uploadChunk response_etag",
          JSON.stringify(response_etag)
        );
        console.log("i am in uploadChunk ETag", response_etag.ETag);
        return response_etag.ETag; // ETag is required to complete the multipart upload
      } else {
        console.log("i am in response error");
        this.emit("i am in error", "response not Found");
        return null; // Ensure a null value is returned if the response is invalid
      }
    } catch (error) {
      console.log("i am in Failed to initiate multipart upload:", error);
      this.emit("i am in error", error);
      throw error; // Re-throw the error for higher-level handling
    }
  }

  async completeMultipartUpload() {
    try {
      // Step 3: Completed Multipart Upload
      let data = JSON.stringify({
        Key: this.keyPath,
        UploadId: this.uploadId,
        Parts: this.parts,
      });
      let config = {
        method: "post",
        maxBodyLength: Infinity,
        url: "/api/multipart-upload/completed-multipart-upload",
        headers: {
          "Content-Type": "application/json",
        },
        data: data,
      };
      await axios
        .request(config)
        .then((response) => {
          console.log(
            "i am in initiateMultipartUpload response",
            JSON.stringify(response.data)
          );
          if (response.data?.success == true) {
            this.emit("completed", { status: 200 });
          } else {
            this.emit("error", response.data);
          }
        })
        .catch((error) => {
          console.log("i am in Failed to completed multipart upload:", error);
          this.emit("error", error);
        });
    } catch (error) {
      console.log("i am in Failed to completed multipart upload:", error);
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
