const express = require("express");
const app = express();
const server = require("http").createServer(app);
const { WebSocket, Server } = require("ws");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { fromString } = require("uuidv4");
const { v5 } = require("uuid");
const port = 3000;
const axios = require("axios");
var expressWs = require("express-ws")(app);

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.ws("/", function (ws, req) {
  console.log("connected", req.query);
  ws.id = uniqueID();
  client.connect(async (err) => {
    const collection = client
      .db("grindery_zapier")
      .collection("connection_ids");
    const new_connection = {
      ws_id: ws.id,
    };

    //search id first in db, if not found - create new one
    const search_result = await collection.findOne({ ws_id: ws.id });
    if (!search_result) {
      const insert_result = await collection.insertOne(new_connection);
    }
    client.close();
  });

  ws.on("message", function (msg) {
    const dataJSON = JSON.parse(msg); //data from connection
    console.log("Message from Grindery: ", dataJSON);
    const payload = { id: "test" }; //payload node
    client.connect(async (err) => {
      const collection = client
        .db("grindery_zapier")
        .collection("connection_ids");

      const webhook_collection = client
        .db("grindery_zapier")
        .collection("webhooks");

      //search id first in db, if not found - create new one
      const search_result_token = await webhook_collection.findOne({
        token: dataJSON.params.fields.token,
      });

      if (search_result_token) {
        const forward_to_zap = await axios.post(
          search_result_token.webhook_url,
          {
            payload,
          }
        );
        console.log("Response from Zapier: ", forward_to_zap);
      }

      const new_connection_token = {
        $set: { token: dataJSON.params.fields.token, ws_id: ws.id },
      };

      //associate connection with token
      const insert_result = await collection.updateOne(
        { token: dataJSON.token },
        new_connection_token,
        { upsert: true }
      );
      client.close(); //close
    });
  });

  ws.on("close", function (msg) {
    client.connect(async (err) => {
      //client.db("grindery_zapier").collection("webbooks");
      const collection = client
        .db("grindery_zapier")
        .collection("connection_ids");
      const delete_connection_id = await collection.deleteOne({
        ws_id: ws.id,
      });
      console.log(`A document was deleted with the ws_id: ${ws.id}`);
      client.close();
    });
  });
  //console.log("Hi Client: ", req);
});

//const wss = new WebSocket.Server({ port: port });

/*wss.on("connection", function connection(ws) {
  //get id - save ID with webhook data
  ws.id = wss.getUniqueID();
  client.connect(async (err) => {
    const collection = client
      .db("grindery_zapier")
      .collection("connection_ids");
    const new_connection = {
      ws_id: ws.id,
    };

    //search id first in db, if not found - create new one
    const search_result = await collection.findOne({ ws_id: ws.id });
    if (!search_result) {
      const insert_result = await collection.insertOne(new_connection);
    }
    client.close();
  });

  wss.clients.forEach(function each(client) {
    console.log("Client.ID: " + client.id);
  });

  ws.on("message", function message(data) {
    const dataJSON = JSON.parse(data);
    const payload = dataJSON.payload;
    client.connect(async (err) => {
      const collection = client
        .db("grindery_zapier")
        .collection("connection_ids");
      const webhook_collection = client
        .db("grindery_zapier")
        .collection("webhooks");

      const new_connection_token = {
        $set: { token: dataJSON.token, ws_id: ws.id },
      };

      //search id first in db, if not found - create new one
      const search_result_token = await webhook_collection.findOne({
        token: dataJSON.token,
      });
      if (search_result_token) {
        const forward_to_zap = await axios.post(
          search_result_token.webhook_url,
          {
            payload,
          }
        );
      }

      //associate connection with token
      const insert_result = await collection.updateOne(
        { token: dataJSON.token },
        new_connection_token,
        { upsert: true }
      );
      client.close();
    });
    //console.log("received: %s from client: %s", dataJSON.token, ws.id);
  });

  ws.on("close", function close() {
    //delete connection from MongoDB
  });

  ws.send("Hi Client");
});

wss.getUniqueID = function () {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + "-" + s4();
};*/

function uniqueID() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + "-" + s4();
}

const uri =
  "mongodb+srv://connex_testing:MkLvwusz9i2K7mOT@cluster0.5d0qb9x.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(process.env.PORT || port, () => {
  console.log(`Listening on port ${port}`);
});

app.post("/webhooks", async (req, res) => {
  console.log("client: ", client);
  client.connect(async (err) => {
    const collection = client.db("grindery_zapier").collection("webhooks");
    // perform actions on the collection object
    //console.log(req.body);
    const hook_url = req.body.url;
    const hook_token = fromString(hook_url);
    const new_webhook = {
      timestamp: Date.now(),
      token: hook_token,
      webhook_url: hook_url,
    };
    const insert_result = await collection.insertOne(new_webhook);
    console.log(
      `A document was inserted with the _id: ${insert_result.insertedId}`
    );
    client.close();
    //res.status(200).send({ data: "ok" });
    res
      .status(200)
      .json({ zap_token: hook_token, id: insert_result.insertedId });
  });
});

app.delete("/webhooks/:webhook_id", async (req, res) => {
  const { webhook_id } = req.params;

  client.connect(async (err) => {
    //client.db("grindery_zapier").collection("webbooks");
    const collection = client.db("grindery_zapier").collection("webhooks");
    const insert_result = await collection.deleteOne({
      _id: new ObjectId(webhook_id),
    });
    console.log(`A document was deleted with the _id: ${webhook_id}`);
    client.close();
    res.status(200).json({ result: "removed" });
  });
});

app.post("/triggerZap", async (req, res) => {
  const token = req.body.token;
  const payload = req.body.payload;
  client.connect(async (err) => {
    const collection = client.db("grindery_zapier").collection("webhooks");
    // perform actions on the collection object
    const search_result = await collection.findOne({ token: token });
    //res.status(200).send({ data: "ok" });
    if (search_result) {
      const forward_to_zap = await axios.post(search_result.webhook_url, {
        payload,
      });

      res.status(200).json({ message: forward_to_zap.status });
    } else {
      res.status(200).json({ err: "Zap not found" });
    }
    //res.status(200).json({ message: search_result.webhook_url });
    client.close();
  });
});

module.exports = app;
