// 1. CONEXIÓN A SUPABASE
var supabaseUrl = 'https://ixfwfvyjwlokkvjcgher.supabase.co';
var supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4Zndmdnlqd2xva2t2amNnaGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNjYxODUsImV4cCI6MjEwNDY0MjE4NX0.M3CKYv5HIiEXl-dSUGp8zFdda7bEVEQuWtjborzm5v0';
var sb = window.supabase.createClient(supabaseUrl, supabaseKey);

// 2. VARIABLES DE LA INTERFAZ
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const cameraModal = document.getElementById('camera-modal');
const video = document.getElementById('video-camara');
const canvas = document.getElementById('canvas-foto');
let streamActual = null;

// 3. SISTEMA DE USUARIOS
async function registrarUsuario() {
    const nombre = document.getElementById('nombre').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if(!nombre || !email || !password) {
        alert("Rellena todos los campos para registrarte.");
        return;
    }

    const { data, error } = await sb.auth.signUp({
        email: email,
        password: password,
    });

    if (error) {
        alert("Error al registrar: " + error.message);
        return;
    }

    const { error: errorPerfil } = await sb
        .from('perfiles')
        .insert([{ id: data.user.id, nombre: nombre }]);

    if (errorPerfil) {
        alert("Error al guardar el perfil: " + errorPerfil.message);
        return;
    }

    alert("¡Cuenta creada! Ya puedes darle a Entrar.");
}

async function iniciarSesion() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if(!email || !password) {
        alert("Por favor, rellena tu email y contraseña.");
        return;
    }

    const { data, error } = await sb.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        alert("Error al entrar: " + error.message);
        return;
    }

    loginScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
    cargarFeed();
}

function cerrarSesion() {
    mainScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
}

// 4. CONTROL DE CÁMARA Y SUBIDA
async function abrirCamara() {
    cameraModal.classList.remove('hidden');
    try {
        streamActual = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' } 
        });
        video.srcObject = streamActual;
    } catch (error) {
        alert("No se pudo acceder a la cámara.");
        console.error(error);
    }
}

function cerrarCamara() {
    cameraModal.classList.add('hidden');
    if (streamActual) {
        streamActual.getTracks().forEach(track => track.stop());
    }
}

async function tomarFoto() {
    const btnCapturar = document.getElementById('btn-capturar');
    btnCapturar.innerText = "Subiendo foto... ⏳";
    btnCapturar.disabled = true;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const contexto = canvas.getContext('2d');
    contexto.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(async (blob) => {
        try {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) throw new Error("No has iniciado sesión");

            const nombreArchivo = `${user.id}-${Date.now()}.jpg`;

            const { error: uploadError } = await sb.storage
                .from('fotos-gym')
                .upload(nombreArchivo, blob, { contentType: 'image/jpeg' });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = sb.storage
                .from('fotos-gym')
                .getPublicUrl(nombreArchivo);

            const { error: dbError } = await sb
                .from('asistencias')
                .insert([{ perfil_id: user.id, foto_url: publicUrl }]);

            if (dbError) throw dbError;

            alert("¡Día superado! Fichaje guardado correctamente 💪");
            cerrarCamara();
            cargarFeed();

        } catch (error) {
            alert("Error: " + error.message);
        } finally {
            btnCapturar.innerText = "Tomar Foto";
            btnCapturar.disabled = false;
        }
    }, 'image/jpeg', 0.8);
}

// 5. CARGAR EL FEED DE FOTOS
async function cargarFeed() {
    const feedDiv = document.getElementById('feed-entrenamientos');
    feedDiv.innerHTML = "<p>Cargando los fichajes de hoy...</p>";

    const hoy = new Date().toISOString().split('T')[0];

    const { data, error } = await sb
        .from('asistencias')
        .select(`
            foto_url,
            creado_en,
            perfiles ( nombre )
        `)
        .gte('creado_en', `${hoy}T00:00:00Z`)
        .order('creado_en', { ascending: false });

    if (error) {
        feedDiv.innerHTML = "<p>Error al cargar las fotos.</p>";
        console.error(error);
        return;
    }

    if (data.length === 0) {
        feedDiv.innerHTML = "<p>Nadie ha ido al gym hoy todavía. ¡Sé el primero! 🫵</p>";
        return;
    }

    feedDiv.innerHTML = ""; 
    data.forEach(asistencia => {
        const hora = new Date(asistencia.creado_en).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const nombreAmigo = asistencia.perfiles.nombre;

        const tarjeta = document.createElement('div');
        tarjeta.className = 'tarjeta-foto';
        tarjeta.innerHTML = `
            <p style="margin-bottom: 5px;"><strong>${nombreAmigo}</strong> 💪 fichó a las ${hora}</p>
            <img src="${asistencia.foto_url}" alt="Foto del gym">
        `;
        feedDiv.appendChild(tarjeta);
    });
}