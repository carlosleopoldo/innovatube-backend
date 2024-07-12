import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import { PrismaClient, User } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('API de InnovaTube');
});

// Ruta de registro de usuario
app.post('/register', async (req, res) => {
  const { name, email, user, password } = req.body;

  if (!name || !email || !user || !password) {
    return res
      .status(400)
      .json({ message: 'Todos los campos son obligatorios.' });
  }

  try {
    const existingUser: User | null = await prisma.user.findUnique({
      where: { username: user },
    });

    if (existingUser) {
      return res
        .status(400)
        .json({ message: 'Un usuario con este nombre de usuario ya existe.' });
    }

    const existingEmail: User | null = await prisma.user.findUnique({
      where: { email },
    });

    if (existingEmail) {
      return res
        .status(400)
        .json({ message: 'Un usuario con este email ya existe.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser: User = await prisma.user.create({
      data: {
        username: user,
        email,
        password: hashedPassword,
        fullName: name,
      },
    });

    res
      .status(201)
      .json({ message: 'Usuario registrado exitosamente.', user: newUser });
  } catch (error) {
    console.error('Error al registrar el usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor corriendo en el puerto: ${port}`));
