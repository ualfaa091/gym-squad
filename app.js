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
let camaraActual = 'user'; // 'user' = frontal, 'environment' = trasera

async function iniciarStream() {
    if (streamActual) {
        streamActual.getTracks().forEach(track => track.stop());
    }
    try {
        streamActual = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: camaraActual }
        });
        video.srcObject = streamActual;
    } catch (error) {
        alert("No se pudo acceder a la cámara.");
        console.error(error);
    }
}

async function abrirCamara() {
    cameraModal.classList.remove('hidden');
    await iniciarStream();
}

async function voltearCamara() {
    camaraActual = camaraActual === 'user' ? 'environment' : 'user';
    await iniciarStream();
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

// 5. LISTA DE INTEGRANTES Y CUADRÍCULAS
let todosLosPerfiles = [];
let fechaStatsActual = new Date();

async function cargarPerfiles() {
    const { data, error } = await sb.from('perfiles').select('id, nombre').order('nombre');
    if (!error) todosLosPerfiles = data;
}

function rangoDelDia(fecha) {
    const inicio = new Date(fecha);
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(fecha);
    fin.setHours(23, 59, 59, 999);
    return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

async function cargarAsistenciasDeFecha(fecha) {
    const { inicio, fin } = rangoDelDia(fecha);
    const { data, error } = await sb
        .from('asistencias')
        .select('perfil_id, foto_url')
        .gte('creado_en', inicio)
        .lte('creado_en', fin);

    if (error) {
        console.error(error);
        return {};
    }

    const mapa = {};
    data.forEach(a => { mapa[a.perfil_id] = a.foto_url; });
    return mapa;
}

function pintarGrid(contenedor, mapaAsistencias) {
    contenedor.innerHTML = "";
    if (todosLosPerfiles.length === 0) {
        contenedor.innerHTML = "<p>Todavía no hay nadie en el grupo.</p>";
        return;
    }
    todosLosPerfiles.forEach(perfil => {
        const foto = mapaAsistencias[perfil.id];
        const casilla = document.createElement('div');
        casilla.className = 'casilla' + (foto ? ' hecho' : '');
        if (foto) {
            casilla.innerHTML = `<img src="${foto}" alt="${perfil.nombre}">`;
            casilla.onclick = () => abrirLightbox(foto);
        } else {
            casilla.innerHTML = `<span class="nombre-casilla">${perfil.nombre}</span>`;
        }
        contenedor.appendChild(casilla);
    });
}

async function cargarFeed() {
    await cargarPerfiles();
    const mapaHoy = await cargarAsistenciasDeFecha(new Date());
    pintarGrid(document.getElementById('grid-hoy'), mapaHoy);
}

// 6. LIGHTBOX (ver foto en grande)
function abrirLightbox(url) {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox').classList.remove('hidden');
}

function cerrarLightbox() {
    document.getElementById('lightbox').classList.add('hidden');
}

// 7. PANTALLA DE ESTADÍSTICAS
async function abrirEstadisticas() {
    mainScreen.classList.add('hidden');
    document.getElementById('stats-screen').classList.remove('hidden');
    fechaStatsActual = new Date();
    await pintarStatsFecha();
    await pintarRanking();
}

function cerrarEstadisticas() {
    document.getElementById('stats-screen').classList.add('hidden');
    mainScreen.classList.remove('hidden');
}

async function cambiarDiaStats(delta) {
    fechaStatsActual.setDate(fechaStatsActual.getDate() + delta);
    await pintarStatsFecha();
}

async function pintarStatsFecha() {
    const label = document.getElementById('stats-fecha-label');
    const hoy = new Date();
    const esHoy = fechaStatsActual.toDateString() === hoy.toDateString();
    label.textContent = esHoy
        ? 'Hoy'
        : fechaStatsActual.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

    const mapa = await cargarAsistenciasDeFecha(fechaStatsActual);
    pintarGrid(document.getElementById('grid-stats'), mapa);
}

async function pintarRanking() {
    const contenedor = document.getElementById('ranking-lista');
    contenedor.innerHTML = "<p>Cargando...</p>";

    const { data, error } = await sb.from('asistencias').select('perfil_id');
    if (error) {
        contenedor.innerHTML = "<p>Error al cargar el ranking.</p>";
        console.error(error);
        return;
    }

    const conteo = {};
    data.forEach(a => { conteo[a.perfil_id] = (conteo[a.perfil_id] || 0) + 1; });

    const ranking = todosLosPerfiles
        .map(p => ({ nombre: p.nombre, total: conteo[p.id] || 0 }))
        .sort((a, b) => b.total - a.total);

    contenedor.innerHTML = "";
    ranking.forEach(r => {
        const fila = document.createElement('div');
        fila.className = 'ranking-fila';
        fila.innerHTML = `<span>${r.nombre}</span><span>${r.total} ${r.total === 1 ? 'día' : 'días'}</span>`;
        contenedor.appendChild(fila);
    });
}