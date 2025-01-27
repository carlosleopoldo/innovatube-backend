import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { Request, Response, NextFunction } from 'express';
import { link } from 'fs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import youtubeSearch from 'youtube-search';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const jwtSecret: string = `${process.env.JWT_SECRET}`;

app.use(bodyParser.json());

app.use(cors());

type VideoType = {
  id: string;
  title: string;
  thumbnail: string;
  description: string;
  link: string;
  isFavorite?: boolean;
};

interface UserPayload {
  userId: number;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

// Middleware para autenticar al usuario
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET as string, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user as UserPayload;
    next();
  });
};

app.get('/', (req, res) => {
    res.status(200).json({ message: 'API de InnovaTube' });
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
    const existingUser = await prisma.user.findUnique({
      where: { username: user },
    });

    if (existingUser) {
      return res
        .status(400)
        .json({ message: 'Un usuario con este nombre de usuario ya existe.' });
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });

    if (existingEmail) {
      return res
        .status(400)
        .json({ message: 'Un usuario con este email ya existe.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
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
    const userMatch = await prisma.user.findUnique({
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
      {
        userId: userMatch.id,
        username: userMatch.username,
        name: userMatch.fullName,
      },
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
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(400).json({ message: 'Usuario no encontrado.' });
    }

    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 2); // Token expira en 2 horas

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        token,
        expiresAt: expires,
      },
    });

    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      to: user.email,
      from: `"InnovaTube" <${process.env.EMAIL_USER}>`,
      subject: 'Recuperación de contraseña - InnovaTube',
      text: `Recibiste esto porque tú (u otra persona) solicitó la recuperación de la contraseña para tu cuenta en InnovaTube.\n\nHaz clic en el siguiente enlace, o pégalo en tu navegador para completar el proceso:\n\n${process.env.SITE_URL}/#/reset-password/${token}\n\nSi no solicitaste esto, ignora este correo y tu contraseña permanecerá sin cambios.\n`,
      html: `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
      <p>Recibiste esto porque tú (u otra persona) solicitó la recuperación de la contraseña para tu cuenta en <strong>InnovaTube</strong>.</p>
      <p>Haz clic en el siguiente enlace, o pégalo en tu navegador para completar el proceso:</p>
      <p><a href="${process.env.SITE_URL}/#/reset-password/${token}" style="color: #007BFF;">Restablecer Contraseña</a></p>
      <p>Si no solicitaste esto, ignora este correo y tu contraseña permanecerá sin cambios.</p>
      <br>
      <p>Saludos,<br>El equipo de InnovaTube</p>
    </div>
  `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      data: { message: 'Correo de recuperación de contraseña enviado.' },
    });
  } catch (error) {
    console.error('Error al enviar correo de recuperación:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para verificar token de restablecimiento de contraseña
app.get('/verify-token/:token', async (req, res) => {
  const { token } = req.params;
  console.log('token', token);

  try {
    const passwordReset = await prisma.passwordReset.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!passwordReset) {
      return res.status(400).json({
        message:
          'Token no válido, no se encuentra el token en nuestro sistema.',
      });
    } else if (passwordReset.expiresAt < new Date()) {
      return res.status(400).json({
        message:
          'El token ha expirado, los token solo son válidos durante 2 horas.',
      });
    }

    res.status(200).json({ data: { email: passwordReset.user.email } });
  } catch (error) {
    console.error('Error al verificar token:', error);
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
    const passwordReset = await prisma.passwordReset.findUnique({
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

    res
      .status(200)
      .json({ data: { message: 'Contraseña restablecida exitosamente.' } });
  } catch (error) {
    console.error('Error al restablecer contraseña:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para buscar en YouTube
app.get('/search', async (req, res) => {
  const query = req.query.q as any;

  if (!query) {
    return res
      .status(400)
      .json({ error: 'El parámetro de búsqueda es requerido' });
  }

  const opts = {
    maxResults: 16,
    key: process.env.YOUTUBE_API_KEY,
    part: 'snippet',
    type: 'video',
  };

  youtubeSearch(query, opts, (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Error al buscar en YouTube' });
    }

    res.json(
      results?.map((video) => {
        return {
          id: video.id,
          title: video.title,
          thumbnail: video.thumbnails?.high?.url,
          description: video.description,
          link: video.link,
        };
      })
    );
  });
});

// Endpoint para marcar un video como favorito
app.post(
  '/mark-favorite',
  authenticateToken,
  async (req: Request, res: Response) => {
    const { video } = req.body.params as { video: VideoType };
    const userId = req.user!.userId;

    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          videos: {
            connectOrCreate: {
              where: { url: video.link },
              create: {
                title: video.title,
                description: video.description,
                url: video.link,
                thumbnail: video.thumbnail,
              },
            },
          },
        },
      });

      res.status(200).json({ message: 'Video marcado como favorito', user });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error al marcar como favorito' });
    }
  }
);

// Endpoint para desmarcar un video como favorito
app.post(
  '/unmark-favorite',
  authenticateToken,
  async (req: Request, res: Response) => {
    const { video } = req.body.params as { video: VideoType };
    const userId = req.user!.userId;

    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          videos: {
            disconnect: { url: video.link },
          },
        },
      });

      res.status(200).json({ message: 'Video desmarcado como favorito', user });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error al desmarcar como favorito' });
    }
  }
);

// Endpoint para obtener los videos favoritos de un usuario
app.get(
  '/favorite-videos',
  authenticateToken,
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;

    try {
      // Busca al usuario con los videos favoritos incluidos
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          videos: true, // Incluye todos los videos favoritos del usuario
        },
      });

      if (!user) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }

      res.status(200).json(
        user.videos.map((video) => {
          return {
            id: video.id,
            title: video.title,
            thumbnail: video.thumbnail,
            description: video.description,
            link: video.url,
            isFavorite: true,
          };
        })
      );
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: 'Error al obtener los videos favoritos' });
    }
  }
);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor corriendo en el puerto: ${port}`));
