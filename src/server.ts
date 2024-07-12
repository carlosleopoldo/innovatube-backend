import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import { PrismaClient, User } from '@prisma/client';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const jwtSecret: string = `${process.env.JWT_SECRET}`;

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

// Ruta de inicio de sesión
app.post('/login', async (req, res) => {
  const { user, password } = req.body;

  if (!user || !password) {
    return res
      .status(400)
      .json({ message: 'Usuario y contraseña son obligatorios.' });
  }

  try {
    const userMatch: User | null = await prisma.user.findUnique({
      where: { username: user },
    });

    if (!userMatch) {
      return res.status(400).json({ message: 'Credenciales incorrectas.' });
    }

    const isPasswordValid = await bcrypt.compare(password, userMatch.password);

    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Credenciales incorrectas.' });
    }

    // Generar JWT
    const token = jwt.sign(
      { userId: userMatch.id, username: userMatch.username },
      jwtSecret,
      { expiresIn: '48h' }
    );

    // Devolver el token en la respuesta
    res.status(200).json({ message: 'Inicio de sesión exitoso.', token });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor corriendo en el puerto: ${port}`));
