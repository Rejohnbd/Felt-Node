const config = {
  URL: "http://vtsapi.greenrevolutionbd.com/api/device-data",
  // URL_DEVICE_USER: "http://vtsapi.greenrevolutionbd.com/api/device-user",
  FIRE_URL: "https://grvts-d658d-default-rtdb.firebaseio.com", // From Firebase Database
  PORT: 9991,
  // API_SECRET_TOKEN: "ce7d6_rejohn_5b9t",
  // MONGO_URL: "mongodb://localhost:27017/mobitrackdb",
};

// Note : Must Replace Firebase Service Account File in Location "/firebase/serviceAccount.json"
module.exports = config;
