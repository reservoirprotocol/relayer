const timestamp = () => `[${new Date().toUTCString()}]`;

const log = (logType: "error" | "info") => {
  if (logType === "error") {
    return (...args: any[]) => console.error(timestamp(), ...args);
  } else {
    return (...args: any[]) => console.log(timestamp(), ...args);
  }
};

export default {
  error: log("error"),
  info: log("info"),
};
