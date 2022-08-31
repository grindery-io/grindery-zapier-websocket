const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const { fromString }  = require('uuidv4');
const port = 3000;

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
  console.log(`Example app listening on port ${port}`);
});

app.post("/webhooks", (req, res) => {
  client.connect((err) => {
    const collection = client.db("test").collection("webhooks");
    // perform actions on the collection object
    const hook_url = req.body.url;
    const hook_token = fromString(hook_url);
    const new_webhook = { name: "Neapolitan pizza", timestamp: new Date().getMilliseconds(), token: hook_token };
    const insert_result = await collection.insertOne(new_webhook);
    console.log(
      `A document was inserted with the _id: ${insert_result.insertedId}`,
    );
    client.close();
    res.status(200).json({zap_token: hook_token, id: insert_result.insertedId})
  });
});

app.delete("/webhooks/:webhook_id", (req, res) => {
  const { webhook_id } = req.params;
});

module.exports = app;
