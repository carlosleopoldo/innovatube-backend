import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import { PrismaClient, User, PasswordReset } from '@prisma/client';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
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

// Ruta para solicitar recuperación de contraseña
app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email es obligatorio.' });
  }

  try {
    const user: User | null = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(400).json({ message: 'Usuario no encontrado.' });
    }

    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 1); // Token expira en 1 hora

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        token,
        expiresAt: expires,
      },
    });

    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      to: user.email,
      from: process.env.EMAIL_USER,
      subject: 'Recuperación de contraseña',
      text: `Recibiste esto porque tú (u otra persona) solicitó la recuperación de la contraseña para tu cuenta.\n\n
             Haz clic en el siguiente enlace, o pégalo en tu navegador para completar el proceso:\n\n
             http://${req.headers.host}/#/reset-password/${token}\n\n
             Si no solicitaste esto, ignora este correo y tu contraseña permanecerá sin cambios.\n`,
    };

    await transporter.sendMail(mailOptions);

    res
      .status(200)
      .json({ message: 'Correo de recuperación de contraseña enviado.' });
  } catch (error) {
    console.error('Error al enviar correo de recuperación:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para restablecer contraseña
app.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password) {
    return res
      .status(400)
      .json({ message: 'La nueva contraseña es obligatoria.' });
  }

  try {
    const passwordReset: PasswordReset | null =
      await prisma.passwordReset.findUnique({
        where: { token },
        include: { user: true },
      });

    if (!passwordReset || passwordReset.expiresAt < new Date()) {
      return res.status(400).json({ message: 'Token inválido o expirado.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: passwordReset.userId },
      data: { password: hashedPassword },
    });

    await prisma.passwordReset.delete({
      where: { token },
    });

    res.status(200).json({ message: 'Contraseña restablecida exitosamente.' });
  } catch (error) {
    console.error('Error al restablecer contraseña:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor corriendo en el puerto: ${port}`));
