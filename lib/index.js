import { AzureUploader } from "./azure.js";
import { DefaultUploader } from "./default.js";
import { OciUploader } from "./oci.js";
import { AWSUploader } from "./aws.js";

class FileUploader {
  constructor() {
    this.listeners = {};
    this.emit = this.emit.bind(this);
    this.on = this.on.bind(this);
    this.uploaderInstance = undefined;
  }
  on(event, callback) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(callback);
    return this;
  }

  emit(event, ...args) {
    const eventListeners = this.listeners[event] || [];
    eventListeners.forEach((callback) => {
      callback(...args);
    });
  }
  retry() {
    this.uploaderInstance && this.uploaderInstance.retry();
  }

  upload({ url, file, csp, maxFileSizeForChunking }) {
    if (!url) {
      throw "URL is required to upload the file";
    }

    if (!file) {
      throw "file is required to upload";
    }

    if (!csp) {
      throw "Cloud service provider(csp) value required to process to request, support are azure";
    }
    if (maxFileSizeForChunking && parseInt(maxFileSizeForChunking) == NaN) {
      throw "maxFileSizeForChunking option should be valid integer equal to or greater than 5";
    }
    maxFileSizeForChunking = parseInt(maxFileSizeForChunking);

    console.log("i am in upload url=" + url + " csp " + csp);

    switch (csp.toLowerCase()) {
      case "azure":
        this.uploaderInstance = new AzureUploader(
          url,
          file,
          maxFileSizeForChunking,
          this.emit
        );
        break;

      case "oci":
        this.uploaderInstance = new OciUploader(
          url,
          file,
          maxFileSizeForChunking,
          this.emit
        );
        break;

      case "aws":
        this.uploaderInstance = new AWSUploader(
          url,
          file,
          maxFileSizeForChunking,
          this.emit
        );
        break;

      default:
        this.uploaderInstance = new DefaultUploader(
          url,
          file,
          maxFileSizeForChunking,
          this.emit
        );
        break;
    }
    return this;
  }
}
export { FileUploader };
