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

const uri = `mongodb+srv://${process.env.mongo_user}:${process.env.mongo_password}@cluster0.5d0qb9x.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.ws("/", function (ws, req) {
  ws.id = uniqueID();
  console.log("connected with id: ", ws.id);
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
    //client.close();
  });

  ws.on("message", function (msg) {
    const dataJSON = JSON.parse(msg); //data from connection
    console.log("Message from Grindery: ", dataJSON);
    client.connect(async (err) => {
      const collection = client
        .db("grindery_zapier")
        .collection("connection_ids");

      const webhook_collection = client
        .db("grindery_zapier")
        .collection("webhooks");

      //search id first in db, if not found - create new one
      var search_result_token = {};
      if (typeof dataJSON !== undefined && dataJSON.id !== null) {
        if (dataJSON.method === "callWebhook") {
          //Trigger a workflow from Zapier
          console.log(
            "Call Webhook on session id: ",
            dataJSON.params.sessionId
          );
          console.log(
            "Data Sent through webhook: ",
            JSON.stringify(dataJSON.params.fields.payload.payload)
          );
          ws.send(JSON.stringify(dataJSON.params.fields.payload));
          //ws.send('{"jsonrpc": "2.0","result":{}, "id":1}');
        }

        if (dataJSON.method === "setupSignal") {
          console.log("Setup Signal from ", dataJSON.params.sessionId);
          search_result_token = await webhook_collection.findOne({
            token: dataJSON.params.fields.token,
          });

          const new_connection_token = {
            $set: { token: dataJSON.params.fields.token, ws_id: ws.id },
          };

          //associate connection with token
          const insert_result = await collection.updateOne(
            { token: dataJSON.token },
            new_connection_token,
            { upsert: true }
          );

          const response_success = {
            jsonrpc: "2.0",
            result: {},
            id: dataJSON.id,
          };
          ws.send(JSON.stringify(response_success));
        }

        if (dataJSON.method === "runAction") {
          //Trigger a zap from Grindery
          const payload = { id: dataJSON.params.sessionId };
          console.log("Run Action from ", dataJSON.params.sessionId);
          search_result_token = await webhook_collection.findOne({
            token: dataJSON.params.fields.token,
          });

          const new_connection_token = {
            $set: { token: dataJSON.params.fields.token, ws_id: ws.id },
          };

          //associate connection with token
          const insert_result = await collection.updateOne(
            { token: dataJSON.token },
            new_connection_token,
            { upsert: true }
          );

          if (search_result_token) {
            console.log("Found Zap URL", search_result_token.webhook_url);
            const forward_to_zap = await axios.post(
              search_result_token.webhook_url,
              {
                payload,
              }
            );

            //test if response is success
            const response_success = {
              jsonrpc: "2.0",
              result: {},
              params: {
                sessionId: `${dataJSON.params.sessionId}`,
              },
              id: dataJSON.id,
            };
            ws.send(JSON.stringify(response_success));
            //ws.send("{jsonrpc: '2.0', result: {}, id: 1}");
          }
        }
        if (dataJSON.method === "ping") {
          /*const resend = {
            jsonrpc: "2.0",
            method: "ping",
            id: dataJSON.id,
          };*/
          const resend = {
            jsonrpc: "2.0",
            result: {},
            id: dataJSON.id,
          };
          ws.send(JSON.stringify(resend));
        }
      }
      //client.close(); //closed
    });
  });

  ws.on("close", function (msg) {
    console.log("Closing WS Client: ", ws.id);
    try {
      client.connect(async (err) => {
        const collection = client
          .db("grindery_zapier")
          .collection("connection_ids");
        const delete_connection_id = await collection.deleteOne({
          ws_id: ws.id,
        });
        console.log(
          `A document was deleted from connections collection with the ws_id: ${ws.id}`
        );
        client.close();
      });
    } catch (error) {
      console.log("Error closing: ", error);
    }
  });
  //console.log("Hi Client: ", req);
});

function uniqueID() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + "-" + s4();
}

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
    console.log(req.body);
    const hook_url = req.body.url;
    const hook_token = req.body.token;
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
