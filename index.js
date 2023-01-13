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
    /*client.send(
      JSON.stringify({
        jsonrpc: "2.0",
        result: { message: "Success" },
        id: dataJSON.id,
      })
    );*/
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
        /*const delete_connection_id = await collection.deleteOne({
          ws_id: ws.id,
        });
        console.log(
          `A document was deleted from connections collection with the ws_id: ${ws.id}`
        );*/
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

      const token_transmissions = client
        .db("grindery_zapier")
        .collection("messages");

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
          /*const new_signal_token = {
            $set: {
              token: dataJSON.params.fields.token,
              ws_id: ws.id,
              sessionId: dataJSON.params.sessionId,
            },
          };*/

          //associate connection with token
          const insert_signal_result = await collection.updateOne(
            { token: dataJSON.params.fields.token },
            new_signal_token,
            { upsert: true }
          );
        }
        if (dataJSON.method === "runAction") {
          console.log("runAction Method from Client ", ws.id);
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
            search_result_token = await webhook_collection.findOne({
              token: token_received,
            });
            console.log("Search complete for token: ", token_received);
            console.log("Result: ", search_result_token);

            //Insert token message, used by zapier perform list
            const new_token_message = {
              $set: { timestamp: Date.now() },
            };

            const insert_message_result = await token_transmissions.insertOne(
              new_token_message
            );
            //end of message insert steps

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
              const data = JSON.parse(
                JSON.stringify(dataJSON.params.fields.data)
              );

              console.log("Data from Action: ", data);
              const forward_to_zap = await axios.post(
                search_result_token.webhook_url,
                data
              );

              //test if response is success
              ws.send(
                JSON.stringify({
                  jsonrpc: "2.0",
                  result: {
                    key: dataJSON.params.key,
                    sessionId: dataJSON.params.sessionId,
                    payload: {
                      url: search_result_token.webhook_url,
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

/*app.ws("/", function (ws, req) {
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

      const token_transmissions = client
        .db("grindery_zapier")
        .collection("messages");

      const data_transmissions = client
        .db("grindery_zapier")
        .collection("data");

      //search id first in db, if not found - create new one
      var search_result_token = {};
      if (typeof dataJSON !== undefined && dataJSON.id !== null) {
        if (dataJSON.method === "callWebhook") {
          const webhook_payload = dataJSON.params.fields.payload.payload;
          //Trigger a workflow from Zapier
          console.log(
            "Call Webhook on session id: ",
            dataJSON.params.sessionId
          );
          console.log(
            "Data Sent through webhook: ",
            JSON.stringify(dataJSON.params.fields.payload.payload)
          );

          search_result_token = await collection.findOne({
            token: dataJSON.params.fields.payload.payload.token,
          });

          if (search_result_token) {
            console.log(
              "Found Token Connection Info: ",
              JSON.stringify(search_result_token)
            );
            ws.id = search_result_token.ws_id;
            ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                method: "notifySignal",
                params: {
                  key: "waitForZap",
                  sessionId: search_result_token.sessionId,
                  payload: webhook_payload,
                },
              })
            );
          } else {
            console.log(
              `${dataJSON.params.fields.payload.payload.token} token not found in DB`
            );
          }
        }

        if (dataJSON.method === "setupSignal") {
          console.log("Setup Signal from ", ws.id);
          console.log("Setup Signal token ", dataJSON.params.fields.token);

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

          //ws.send(JSON.stringify(response_success));
        }

        if (dataJSON.method === "runAction") {
          //Trigger a zap from Grindery
          const payload = { id: dataJSON.params.sessionId };
          console.log("Run Action from ", dataJSON.params.sessionId);

          search_result_token = await webhook_collection.findOne({
            token: dataJSON.params.fields.token,
          });

          //Insert token message, used by zapier perform list
          const new_token_message = {
            $set: { timestamp: Date.now() },
          };

          const insert_message_result = await token_transmissions.insertOne(
            new_token_message
          );
          //end of message insert steps

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
        if (dataJSON.method === "ping") {
          /*const resend = {
            jsonrpc: "2.0",
            method: "ping",
            id: dataJSON.id,
          };
          const resend = {
            jsonrpc: "2.0",
            result: {},
            id: dataJSON.id,
            //sessionId: dataJSON.params.sessionId,
          };
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              result: { message: "Success" },
              id: dataJSON.id,
            })
          );
          console.log("Respond Success to Ping");
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
  console.log("connection count", server.getConnections.length);
});

module.exports = app;*/
