import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Routes
import authRoutes from './routes/authRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import leadRoutes from './routes/leadRoutes.js';
import importRoutes from './routes/importRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import templateRoutes from './routes/templateRoutes.js';
import availabilityRoutes from './routes/availabilityRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import orderFormConfigRoutes from './routes/orderFormConfigRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import shiprocketRoutes from './routes/shiprocketRoutes.js';
import appSettingsRoutes from './routes/appSettingsRoutes.js';
import followUpRoutes from './routes/followUpRoutes.js';

// Middleware
import { errorHandler } from './middleware/errorHandler.js';
import { authenticateToken } from './middleware/auth.js';
import { startAlertService } from './services/alertService.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Get the current LAN IP for logs
function getLanIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Dynamic CORS: allow localhost + any local network IP + production domain
function isAllowedOrigin(origin) {
    if (!origin) return true; // Allow non-browser requests (curl, Postman, etc.)
    // Allow localhost on any port
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
    if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
    // Allow any 192.168.x.x address (local network)
    if (/^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin)) return true;
    // Allow any 10.x.x.x address (also local network)
    if (/^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin)) return true;
    // Allow production domain
    if (origin === 'https://bookmyassignment.in' || origin === 'https://www.bookmyassignment.in') return true;
    return false;
}

// Socket.IO for real-time updates
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            if (isAllowedOrigin(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST'],
    },
});

// Make io accessible in routes
app.set('io', io);

// Start Alert Service
startAlertService(io);

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// CORS
app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
});
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files (like uploaded QR codes, passbooks)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/students', authenticateToken, studentRoutes);
app.use('/api/leads', authenticateToken, leadRoutes);
app.use('/api/import', authenticateToken, importRoutes);
app.use('/api/tasks', authenticateToken, taskRoutes);
// Public form routes (no auth) must be before the authenticated template routes
app.use('/api/templates', templateRoutes);  // auth checked per-route inside the router
app.use('/api/availability', authenticateToken, availabilityRoutes);
app.use('/api/activity', authenticateToken, activityRoutes);
app.use('/api/team', authenticateToken, teamRoutes);
app.use('/api/order-form-config', orderFormConfigRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
app.use('/api/shiprocket', authenticateToken, shiprocketRoutes);
app.use('/api/app-settings', authenticateToken, appSettingsRoutes);
app.use('/api/follow-ups', authenticateToken, followUpRoutes);


// Error handling
app.use(errorHandler);

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join personal room for targeted notifications
    socket.on('join-user-room', (userId) => {
        if (userId) socket.join(`user-${userId}`);
    });

    socket.on('join-import-room', (importId) => {
        socket.join(`import-${importId}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
const lanIP = getLanIP();

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`
  🚀 CRM Backend Server running!
  
  📍 Local:     http://localhost:${PORT}
  📍 Network:   http://${lanIP}:${PORT}
  📍 Health:    http://${lanIP}:${PORT}/health
  📍 API:       http://${lanIP}:${PORT}/api
  
  🔌 Socket.IO: Ready for real-time updates
  `);
});

export { io };
