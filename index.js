const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { fromString } = require("uuidv4");
const { v5 } = require("uuid");
const port = 3000;
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

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
    client.db("grindery_zapier").collection("webbooks");
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
      const forward_to_zap = await fetch(search_result.webhook_url, {
        method: "post",
        body: JSON.stringify(payload),
      });
      const zap_response = await forward_to_zap.json();
      if (zap_response.ok) {
        res.status(200).json({ message: "Sent to zap" });
      } else {
        res.status(200).json({ err: "Err communicating with Zap" });
      }
    } else {
      res.status(200).json({ err: "Zap not found" });
    }
    client.close();
  });
});

module.exports = app;
