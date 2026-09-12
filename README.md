# 🏋️‍♂️ Gym Squad PWA

Una Progressive Web App (PWA) serverless diseñada para gamificar y monitorizar la asistencia deportiva en grupos cerrados. Desarrollada con enfoque Mobile-First y conexión directa a base de datos.

## 🚀 Características Principales
* **Instalabilidad PWA:** Service Worker configurado con estrategia *Network First* y Web App Manifest para instalación nativa en iOS/Android.
* **Integración de Hardware:** Uso de la API `navigator.mediaDevices` para la captura y renderizado de fotografías in-app mediante Canvas.
* **Autenticación:** Gestión de sesiones de usuario y vinculación de identidades mediante Supabase Auth.
* **Almacenamiento Cloud:** Procesamiento de imágenes (Blobs) y subida asíncrona a buckets de almacenamiento.
* **Feed Dinámico:** Consulta y renderizado de registros en base a marcas de tiempo (timestamps) recientes.

## 🛠️ Stack Tecnológico
* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+).
* **Backend as a Service (BaaS):** Supabase (PostgreSQL, Auth, Storage).
* **Hosting:** GitHub Pages.

## 🗄️ Modelo de Datos

El sistema se apoya en un esquema relacional ligero en PostgreSQL:

| Tabla | Atributos Clave | Relación |
| :--- | :--- | :--- |
| `perfiles` | `id` (UUID, PK), `nombre` (Text) | 1:N con asistencias |
| `asistencias` | `id` (UUID, PK), `perfil_id` (UUID, FK), `foto_url` (Text), `creado_en` (Timestamp) | N:1 con perfiles |
