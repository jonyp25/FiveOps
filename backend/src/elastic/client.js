const { Client } = require('@elastic/elasticsearch');
const fs = require('node:fs');

const config = {
  node: process.env.ELASTICSEARCH_NODE || 'https://localhost:9200'
};

if (process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD) {
  config.auth = {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD
  };
}

// Elasticsearch 9 enables HTTPS with a locally generated CA by default.
// Trust that CA explicitly rather than disabling TLS certificate verification.
if (process.env.ELASTICSEARCH_CA_CERT_PATH) {
  config.tls = {
    ca: fs.readFileSync(process.env.ELASTICSEARCH_CA_CERT_PATH)
  };
}

module.exports = new Client(config);
