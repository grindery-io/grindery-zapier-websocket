const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
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

/*app.listen(process.env.PORT || port, () => {
  console.log(`Example app listening on port ${port}`);
});*/

app.post("/webhooks", (req, res) => {
  client.connect((err) => {
    const collection = client.db("test").collection("webhooks");
    // perform actions on the collection object

    client.close();
  });
});

app.delete("/webhooks/:webhook_id", (req, res) => {
  //find by id
});

module.exports = app;
