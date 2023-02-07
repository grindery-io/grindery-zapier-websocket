const express = require("express");
const { Server } = require("ws");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = 3000;
const axios = require("axios");

const PORT = process.env.PORT || 3000;
const INDEX = "/index.js";

const server = express()
  .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const wss = new Server({ server });

const uri = `mongodb+srv://${process.env.mongo_user}:${process.env.mongo_password}@cluster0.5d0qb9x.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

setInterval(() => {
  wss.clients.forEach((client) => {
    console.log("Sending to Client ID: ", client.id);
  });
}, 30000);

function sendMessageToClient(id, sessionId, payload) {
  wss.clients.forEach((client) => {
    if (client.id === id) {
      client.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "notifySignal",
          params: {
            key: "waitForZap",
            sessionId: search_result_token.sessionId,
            payload: payload,
          },
        })
      );
    }
  });
}

function uniqueID() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + "-" + s4();
}

wss.on("connection", (ws) => {
  ws.id = uniqueID();
  console.log("Client connected with ID: ", ws.id);

  //on close, remove entry DB
  ws.on("close", () => {
    console.log(`Client ${ws.id} Disconnected`);
    try {
      client.connect(async (err) => {
        const collection = client
          .db("grindery_zapier")
          .collection("connection_ids");
        client.close();
      });
    } catch (error) {
      console.log("Error closing: ", error);
    }
  });

  ws.on("message", function (msg) {
    console.log("Message from Client ID: ", ws.id);
    const dataJSON = JSON.parse(msg); //data from connection
    console.log("Message from Grindery: ", dataJSON);
    client.connect(async (err) => {
      const collection = client
        .db("grindery_zapier")
        .collection("connection_ids");

      //finding webhook urls
      const webhook_collection = client
        .db("grindery_zapier")
        .collection("webhooks");

      const data_transmissions = client
        .db("grindery_zapier")
        .collection("latest_data");

      if (typeof dataJSON !== undefined && dataJSON.id !== null) {
        if (dataJSON.method === "callWebhook") {
          console.log("CallWebhook Method from Client ", ws.id);
          const webhook_payload = dataJSON.params.fields.payload.payload;
          //Trigger a workflow from Zapier
          console.log("Data Payload: ", JSON.stringify(dataJSON));
          console.log(
            "Call Webhook on session id: ",
            dataJSON.params.sessionId
          );
          console.log(
            "Data Sent through webhook: ",
            JSON.stringify(dataJSON.params.fields.payload.payload)
          );

          search_result_token = await collection.findOne({
            token: dataJSON.params.fields.payload.token,
          });

          if (search_result_token) {
            console.log(
              "Found Token Connection Info: ",
              JSON.stringify(search_result_token)
            );
            //send to connection
            ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                result: {
                  sessionId: dataJSON.params.sessionId,
                },
                id: dataJSON.id,
              })
            );
            sendMessageToClient(
              search_result_token.ws_id,
              search_result_token.sessionId,
              webhook_payload
            );
          } else {
            console.log(
              `${dataJSON.params.fields.payload.token} token not found in DB`
            );
          }
        }
        if (dataJSON.method === "setupSignal") {
          console.log("setupSignal Method from Client ", ws.id);
          const new_signal_token = {
            $set: {
              token: dataJSON.params.fields.token,
              ws_id: ws.id,
              sessionId: dataJSON.params.sessionId,
            },
          };

          //associate connection with token
          const insert_signal_result = await collection.updateOne(
            { token: dataJSON.params.fields.token },
            new_signal_token,
            { upsert: true }
          );
        }
        if (dataJSON.method === "runAction") {
          console.log("runAction Method from Client ", ws.id);
          console.log(`Client ID ${ws.id} has payload ${dataJSON.params}`);
          //Trigger a zap from Grindery
          const payload = { id: dataJSON.params.sessionId };
          const token_received = dataJSON.params.fields.token;

          console.log("Run Action from ", dataJSON.params.sessionId);
          if (dataJSON.params.fields.dryRun) {
            //testing from Grindery
            const new_test = {
              $set: {
                token: dataJSON.params.fields.token,
                timestamp: Date.now(),
                data: dataJSON.params.fields.data,
              },
            };
            const insert_test = await data_transmissions.updateOne(
              { token: dataJSON.params.fields.token },
              new_test,
              { upsert: true }
            );
            ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                result: {
                  key: dataJSON.params.key,
                  sessionId: dataJSON.params.sessionId,
                  payload: {
                    url: "http://url.com",
                  },
                },
                id: dataJSON.id,
              })
            );
          } else {
            console.log("Searching DB for token: ", token_received);
            let search = await webhook_collection.findOne({
              token: token_received,
            });
            console.log("Result of Search: ", search);
            search_result_token = await webhook_collection.findOne({
              token: token_received,
            });
            console.log("Search complete for token: ", token_received);
            console.log("Result: ", search);

            if (search !== null) {
              console.log("Found Zap URL", search.webhook_url);
              const data = JSON.parse(
                JSON.stringify(dataJSON.params.fields.data)
              );

              console.log("Data from Action: ", data);
              const forward_to_zap = await axios.post(search.webhook_url, data);

              //test if response is success
              ws.send(
                JSON.stringify({
                  jsonrpc: "2.0",
                  result: {
                    key: dataJSON.params.key,
                    sessionId: dataJSON.params.sessionId,
                    payload: {
                      url: search.webhook_url,
                    },
                  },
                  id: dataJSON.id,
                })
              );
            } else {
              ws.send(
                JSON.stringify({
                  jsonrpc: "2.0",
                  result: {
                    key: dataJSON.params.key,
                    sessionId: dataJSON.params.sessionId,
                    payload: {},
                  },
                  id: dataJSON.id,
                })
              );
            }
          }
        }
        if (dataJSON.method === "ping") {
          console.log("Ping Method from Client ", ws.id);
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              result: { message: "Success" },
              id: dataJSON.id,
            })
          );
        }
      } //end of testing if dataJSON exists
    });
  });
});
