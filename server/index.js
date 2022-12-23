const keys = require('./keys');

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

/* Postgres setup. */
const { Pool } = require('pg');
const pgClient = new Pool({
    user: keys.pgUser,
    host: keys.pgHost,
    database: keys.pgDatabase,
    password: keys.pgPassword,
    port: keys.pgPort  
});

/* When connected to db, create table to store indices of queried fibonacci numbers. */
pgClient.on('connect', (client) => {
    client
      .query('CREATE TABLE IF NOT EXISTS values (number INT)')
      .catch((err) => console.error(err));
});

/* Redis setup */
const redis = require('redis');
const redisClient = redis.createClient({
    host: keys.redisHost,
    port: keys.redisPort,
    retry_strategy: () => 1000
});
const redisPublisher = redisClient.duplicate();

/* Define express routes. */

/* Default */
app.get('/', (req, res) => {
    res.send('Hi');
});

/* Get indices of queried fibonacci numbers from Postgres db. */
app.get('/values/all', async (req, res) => {
    const values = await pgClient.query('SELECT * from values');
    res.send(values.rows);
});

/* Get all cached fibonacci key pairs (key = index) (val = fib #). */
app.get('/values/current', async (req, res) => {
    redisClient.hgetall('values', (err, values) => {
        res.send(values);
    });
});

/* Add a new fibonacci number to Redis and Postgres. */
app.post('/values', async (req, res) => {
    const index = req.body.index;
    if (parseInt(index) > 40) {
        return res.status(422).send('Index too high');
    }   

    /* Publish redis insert event that the worker will receive. */
    redisClient.hset('values', index, 'Nothing yet!');
    redisPublisher.publish('insert', index);

    /* Add index of fibonacci number to Postgres db. */
    pgClient.query('INSERT INTO values(number) VALUES($1)', [index]);

    res.send({working: true});
});

app.listen(5000, err => {
    console.log('Listening');
});
