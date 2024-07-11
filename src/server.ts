import express from 'express';
import bodyParser from 'body-parser';

const app = express();

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Hola mundo');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor corriendo en el puerto: ${port}`));
