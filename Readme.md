# PeerLink 

PeerLink is a peer-to-peer (P2P) file sharing application that allows users to securely and directly transfer files without intermediate cloud storage. A sender uploads a file, receives a unique code (port number), and the receiver uses that code to download the file directly from the sender's node.

## 🚀 Functionalities

- **Direct P2P File Transfer:** Files are streamed directly from the sender to the receiver.
- **Dynamic Port Generation:** Automatically assigns an available dynamic port (49152 - 65535) for each shared file.
- **Modern User Interface:** A sleek, responsive Next.js frontend with drag-and-drop file upload capabilities.
- **No File Size Limits:** Since files are transferred P2P and not permanently stored, you bypass traditional upload limits.
- **Easy Deployment:** Includes a comprehensive VPS setup script and Docker Compose configuration for quick deployment.

## 🛠️ Tech Stack

**Backend**
- **Language:** Java 17
- **Build Tool:** Maven
- **Server:** Built-in lightweight Java HTTP Server (`com.sun.net.httpserver`)
- **Libraries:** Apache Commons FileUpload & IO

**Frontend**
- **Framework:** Next.js 14 (React 18)
- **Styling:** TailwindCSS
- **HTTP Client:** Axios
- **Components:** React Dropzone, React Icons

**Infrastructure & Deployment**
- Docker & Docker Compose
- Nginx (Reverse Proxy)
- PM2 (Process Manager)
- Bash (`vps-setup.sh`)

## 📂 Project Structure

```text
PeerLink/
├── src/main/java/p2p/      # Java Backend Source Code
│   ├── controller/         # HTTP Handlers (Upload, Download, CORS)
│   ├── service/            # P2P File Sharing Server Logic
│   ├── utils/              # Port Generation Utilities
│   └── App.java            # Main Application Entry Point
├── ui/                     # Next.js Frontend App
│   ├── package.json        
│   └── ...                 # React Components, Tailwind Config
├── pom.xml                 # Maven Configuration
├── docker-compose.yml      # Docker Compose configuration
├── Dockerfile.backend      # Backend Dockerfile
├── Dockerfile.frontend     # Frontend Dockerfile
└── vps-setup.sh            # Automated EC2/VPS deployment script
```

## 💻 Local Setup Guide

### Prerequisites
- Java 17 or higher
- Node.js 18 or higher
- Maven

### Option 1: Manual Setup

**1. Start the Backend**
```bash
# From the root directory
mvn clean package
# Run the application (ensure dependencies are accessible on the classpath)
java -cp "target/p2p-1.0-SNAPSHOT.jar:$(mvn dependency:build-classpath -DincludeScope=runtime -Dmdep.outputFile=/dev/stdout -q)" p2p.App
```
The backend will start on `http://localhost:8080`.

**2. Start the Frontend**
```bash
# Open a new terminal
cd ui
npm install
npm run dev
```
The frontend UI will be available at `http://localhost:3000`.

### Option 2: Docker Compose

If you have Docker installed, you can easily spin up both the frontend and backend using Docker Compose.

```bash
docker-compose up --build
```

*Note: For P2P file transfers to work properly in Docker, the container exposes the dynamic port range (49152-65535) required for individual file transfers.*

## ☁️ VPS / EC2 Deployment Guide

1. Clone this repository on your Ubuntu/Debian server.
2. Run the provided setup script:
   ```bash
   chmod +x vps-setup.sh
   ./vps-setup.sh
   ```
3. Make sure to **open Port 80 (HTTP)** in your AWS Security Group.
4. **Crucial:** Open the **Custom TCP Port Range `49152-65535`** in your cloud provider's firewall/Security Group to allow the P2P file transfers to connect directly.
