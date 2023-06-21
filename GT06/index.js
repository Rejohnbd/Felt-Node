var gps = require("./lib/server");
var util = require("./lib/functions");
require("dotenv").config();
var requestify = require("requestify");
var moment = require("moment");
// Configuration File
var config = require("./config");
var options = {
  debug: false,
  port: config.PORT,
  device_adapter: "GT06",
};
// Firebase
var admin = require("firebase-admin");
var serviceAccount = require("./firebase/serviceAccount.json");

// Device API Model
var Location = require("./api/models/location");
var Fence = require("./api/models/fence");
var FenceAlert = require("./api/models/fencealert");

//var mongoose = require("mongoose");

const myLogger = require("./utils/logger");
const errorLogger = myLogger.getLogger("error");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: config.FIRE_URL,
});

var deviceRef = admin.database().ref().child("Devices");

// Server Data Header Prepare
var headers = {
  "Content-Type": "application/json",
  // "api-token": config.API_TOKEN,
};

/*
mongoose
  .connect(config.MONGO_URL, {
    useNewUrlParser: true,
    useCreateIndex: true,
  })
  .then((db) => {
    console.log("connected");
  })
  .catch((error) => {
    console.log("error", error);
  });
*/
var server = gps.server(options, function (device, connection) {
  console.log("runnding");
  var dev_stat = 0;

  device.on("login_request", function (device_id, msg_parts) {
    console.log("Called Login");

    deviceRef.child(device_id).once("value", function (snapshot) {
      var status = snapshot.child("Data").child("status").val();

      if (status) {
        dev_stat = status;
      } else {
        console.log("First Login");
        deviceRef.child(device_id).child("id").set(device_id);
      }
    });

    // Some devices sends a login request before transmitting their position
    // Do some stuff before authenticate the device...

    // Accept the login request. You can set false to reject the device.
    this.login_authorized(true);
  });

  //PING -> When the gps sends their position
  device.on("ping", function (str) {
    console.log("Called Ping");

    console.log(device.uid, "str");

    var lat_raw = str.substr(14, 8);
    var lng_raw = str.substr(22, 8);
    var speed_raw = str.substr(30, 2);
    var course_raw = str.substr(32, 4);
    var date = str.substr(0, 12);
    var device_time = get_deviceTime(date);
    var date = get_date(device_time);

    console.log(course_raw, "course_raw");
    console.log(hex2bin(course_raw), "hex2bin");

    console.log(parseInt(hex2bin(course_raw), 2), "rotation");
    // console.log(device_time)

    var rawData = {
      status: dev_stat.toString(),
      lat: dex_to_degrees(lat_raw),
      lng: dex_to_degrees(lng_raw),
      rotation: parseInt(hex2bin(course_raw), 2),
      speed: dex_to_degrees(speed_raw) * 1800000,
    };

    fire_data = {
      imei: device.uid,
      status: dev_stat,
      lat: dex_to_degrees(lat_raw),
      lng: dex_to_degrees(lng_raw),
      rotation: parseInt(hex2bin(course_raw), 2),
      speed: dex_to_degrees(speed_raw) * 1800000,
      device_time: device_time,
      devicetime: moment(device_time).add(6, "hours"),
      date: date,
    };

    if (util.in_bd(fire_data)) {
      //console.log("Call in Bangladesh")
      sendToFireBase(rawData);
      sendToServer(fire_data);
      // getFenceAndPushNotification(fire_data);
    }
    //return str;
  });

  device.on("alarm", function (alarm_code, alarm_data, msg_data) {
    console.log(
      "Help! Something happend: " + alarm_code + " (" + alarm_data.msg + ")"
    );
    //call_me();
  });

  device.on("other", function (msg_data) {
    //console.log("from Other",msg_data);
  });

  device.on("status", function (status, msg_data) {
    //console.log("Status",status)
    var st = hex2bin(status).substr(6, 1);
    dev_stat = st;
  });

  function get_deviceTime(date) {
    var device_time =
      "20" +
      parseInt(date.substr(0, 2), 16).toString().lpad("0", 2) +
      "-" +
      parseInt(date.substr(2, 2), 16).toString().lpad("0", 2) +
      "-" +
      parseInt(date.substr(4, 2), 16).toString().lpad("0", 2) +
      " " +
      parseInt(date.substr(6, 2), 16).toString().lpad("0", 2) +
      ":" +
      parseInt(date.substr(8, 2), 16).toString().lpad("0", 2) +
      ":" +
      parseInt(date.substr(10, 2), 16).toString().lpad("0", 2);

    return device_time;
  }

  function get_date(device_time) {
    let dateTimeArr = device_time.split(" ");
    let dateStr = dateTimeArr[0];
    let timeStr = dateTimeArr[1];
    let datetime = new Date(dateStr + "T" + timeStr + "Z");

    datetime.setHours(datetime.getHours() - 6);

    let date = {
      year: datetime.getFullYear(),
      month: datetime.getMonth(),
      day: datetime.getDate(),
      hour: datetime.getHours(),
      minute: datetime.getMinutes(),
      second: datetime.getSeconds(),
    };

    return date;
  }
  // Send Data to Firebase
  function sendToFireBase(rawData) {
    deviceRef.child(device.uid).child("Data").update(rawData);
  }
  // Send Data to Server
  function sendToServer(fireData) {
    console.log(fireData, "for post");
    const location = new Location(fireData);
    location.save().catch((err) => {
      errorLogger.error("Location Failed to Save", err.message);
    });

    requestify
      .request(config.URL, {
        method: "POST",
        body: fireData,
        headers: headers,
      })
      .then(function (response) {
        // console.log("Reply", response.getBody());
        console.log("Location Saved To Database");
      })
      .catch((err) => {
        errorLogger.error("Request to Other Server ", err.message);
      });
  }

  // function getFenceAndPushNotification(fireData) {
  //   var imei = fireData.imei;

  //   Fence.findOne({ imei: imei })
  //     .then((fence) => {
  //       if (fence) {
  //         var lat = fence.lat;
  //         var lng = fence.lng;
  //         if (
  //           getDistanceFromLatLonInMeter(lat, lng, fireData.lat, fireData.lng) >
  //           43
  //         ) {
  //           fence["new_lat"] = fireData.lat;
  //           fence["new_lng"] = fireData.lng;
  //           sendNotification(fence);
  //         }
  //       } else {
  //         // console.log("Fence Not Set Yet")
  //       }
  //     })
  //     .catch((err) => {
  //       errorLogger.error("In Find Fence", err.message);
  //       console.log(err);
  //     });
  // }
});

// Convert Hexavalue to Human Readable Format
function dex_to_degrees(dex) {
  return parseInt(dex, 16) / 1800000;
}

// Left Pading String
String.prototype.lpad = function (padString, length) {
  var str = this;
  while (str.length < length) str = padString + str;
  return str;
};

// CXonvert Hexadecimal to Binary
function hex2bin(hex) {
  return ("00000000" + parseInt(hex, 16).toString(2)).substr(-8);
}

// Calculate Distence in Meter
function getDistanceFromLatLonInMeter(lat1, lon1, lat2, lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2 - lat1); // deg2rad below
  var dLon = deg2rad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c * 1000; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

//Send Notification to Server
// function sendNotification(fence) {
//   var token = fence.user_token;
//   var payload = {
//     notification: {
//       title: "Fencing Alart",
//       body: fence.driver_name + " Has Been Changed its Location",
//       sound: "alarm",
//     },
//     data: {
//       alert_type: "Fencing",
//       device_id: String(fence.imei),
//     },
//   };

//   admin
//     .messaging()
//     .sendToDevice(token, payload)
//     .then(function (response) {
//       // Delete the fence
//       deletefence(fence.imei);
//       saveFenceToDatabase(fence);
//     })
//     .catch(function (err) {
//       errorLogger.error("Error in send Notification", err.message);
//       // Delete The Fence
//       deletefence(fence.imei);
//     });
// }

//Delete Fence After Sending Notification to Server
// function deletefence(imei) {
//   Fence.findOne({ imei: imei }).then((newfence) => {
//     if (newfence != null) {
//       Fence.deleteOne({ _id: newfence._id })
//         .then((deleted) => {
//           //console.log("Fence Deleted")
//         })
//         .catch((err) => {
//           errorLogger.error("Error in send Delete fence", err.message);
//         });
//     }
//   });
// }

// Save the Fence to Database for Showing Fence Status for App User
// function saveFenceToDatabase(fence) {
//   const alert = new FenceAlert(fence);
//   alert
//     .save()
//     .then((alertfence) => {
//       //console.log("Alert Save")
//     })
//     .catch((err) => {
//       console.log(err);
//       errorLogger.error("Error in Save Fence Alert", err.message);
//     });
// }
