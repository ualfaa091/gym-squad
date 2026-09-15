// 1. CONEXIÓN A SUPABASE
var supabaseUrl = 'https://ixfwfvyjwlokkvjcgher.supabase.co';
var supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4Zndmdnlqd2xva2t2amNnaGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNjYxODUsImV4cCI6MjEwNDY0MjE4NX0.M3CKYv5HIiEXl-dSUGp8zFdda7bEVEQuWtjborzm5v0';
var sb = window.supabase.createClient(supabaseUrl, supabaseKey);

// 2. VARIABLES DE LA INTERFAZ
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const bottomNav = document.getElementById('bottom-nav');
const cameraModal = document.getElementById('camera-modal');
const video = document.getElementById('video-camara');
const canvas = document.getElementById('canvas-foto');
let streamActual = null;
let miPerfilId = null;

// 3. SISTEMA DE USUARIOS
async function registrarUsuario() {
    const nombre = document.getElementById('nombre').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!nombre || !email || !password) {
        alert("Rellena todos los campos para registrarte.");
        return;
    }

    const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { nombre: nombre } }
    });

    if (error) {
        alert("Error al registrar: " + error.message);
        return;
    }

    alert("¡Cuenta creada! Dale a Entrar. El líder del grupo tiene que aprobarte antes de que puedas usar la app.");
}

let esLider = false;

async function iniciarSesion() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!email || !password) {
        alert("Por favor, rellena tu email y contraseña.");
        return;
    }

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
        alert("Error al entrar: " + error.message);
        return;
    }

    await entrarConSesion(data.session);
}

// Crea la fila en 'perfiles' si todavía no existe (primera vez que hay sesión de verdad)
async function asegurarPerfil(user) {
    const { data: existente } = await sb
        .from('perfiles')
        .select('id, nombre, aprobado, es_lider')
        .eq('id', user.id)
        .maybeSingle();

    if (existente) return existente;

    const nombre = (user.user_metadata && user.user_metadata.nombre) || user.email.split('@')[0];
    const { data: nuevo, error } = await sb
        .from('perfiles')
        .insert([{ id: user.id, nombre: nombre }])
        .select('id, nombre, aprobado, es_lider')
        .single();

    if (error) {
        console.error(error);
        return null;
    }
    return nuevo;
}

async function entrarConSesion(session) {
    if (!session) return;
    const user = session.user;
    miPerfilId = user.id;

    const perfil = await asegurarPerfil(user);
    if (!perfil) {
        alert("No se pudo cargar tu perfil. Inténtalo de nuevo.");
        return;
    }
    esLider = !!perfil.es_lider;

    loginScreen.classList.add('hidden');

    if (!perfil.aprobado) {
        document.getElementById('pending-screen').classList.remove('hidden');
        return;
    }

    document.getElementById('pending-screen').classList.add('hidden');
    bottomNav.classList.remove('hidden');
    document.getElementById('nav-admin').classList.toggle('hidden', !esLider);

    await cargarPerfiles();
    await cambiarPestana('main');
}

async function cerrarSesion() {
    await sb.auth.signOut();
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById('pending-screen').classList.add('hidden');
    bottomNav.classList.add('hidden');
    loginScreen.classList.remove('hidden');
}

// Si ya había sesión guardada en el navegador, entra directo sin pedir login
sb.auth.getSession().then(({ data: { session } }) => {
    if (session) entrarConSesion(session);
});

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
    const mapaHoy = await cargarAsistenciasDeFecha(new Date());
    if (mapaHoy[miPerfilId]) {
        alert("Ya fichaste hoy. Solo se admite un fichaje al día.");
        return;
    }
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
            await cargarFeed();

        } catch (error) {
            alert("Error: " + error.message);
        } finally {
            btnCapturar.innerText = "Tomar Foto";
            btnCapturar.disabled = false;
        }
    }, 'image/jpeg', 0.8);
}

// 5. NAVEGACIÓN ENTRE PESTAÑAS
async function cambiarPestana(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(tab + '-screen').classList.remove('hidden');
    document.querySelectorAll('#bottom-nav button').forEach(b => {
        b.classList.toggle('activo', b.dataset.tab === tab);
    });

    if (tab === 'main') await cargarFeed();
    if (tab === 'days') await pintarDiaFecha();
    if (tab === 'calendar') {
        if (!calendarioPerfilId) calendarioPerfilId = miPerfilId;
        pintarSelectorPersonas();
        await pintarCalendario();
    }
    if (tab === 'stats') await pintarStatsMes();
    if (tab === 'admin') await pintarPendientes();
}

// 6. LISTA DE INTEGRANTES
let todosLosPerfiles = [];

async function cargarPerfiles() {
    const { data, error } = await sb
        .from('perfiles')
        .select('id, nombre')
        .eq('aprobado', true)
        .order('nombre');
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
    const mapaHoy = await cargarAsistenciasDeFecha(new Date());
    pintarGrid(document.getElementById('grid-hoy'), mapaHoy);
}

// 7. LIGHTBOX (ver foto en grande)
function abrirLightbox(url) {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox').classList.remove('hidden');
}

function cerrarLightbox() {
    document.getElementById('lightbox').classList.add('hidden');
}

// 8. PESTAÑA "DÍAS" (cuadrícula de fotos navegando por días)
let fechaDiasActual = new Date();

async function cambiarDia(delta) {
    fechaDiasActual.setDate(fechaDiasActual.getDate() + delta);
    await pintarDiaFecha();
}

async function pintarDiaFecha() {
    const label = document.getElementById('dias-fecha-label');
    const hoy = new Date();
    const esHoy = fechaDiasActual.toDateString() === hoy.toDateString();
    label.textContent = esHoy
        ? 'Hoy'
        : fechaDiasActual.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

    const mapa = await cargarAsistenciasDeFecha(fechaDiasActual);
    pintarGrid(document.getElementById('grid-dias'), mapa);
}

// 9. PESTAÑA "CALENDARIO" (calendario mensual por persona, verde/rojo)
let calendarioPerfilId = null;
let calendarioViewDate = new Date();

function pintarSelectorPersonas() {
    const contenedor = document.getElementById('selector-personas');
    contenedor.innerHTML = "";
    todosLosPerfiles.forEach(p => {
        const chip = document.createElement('button');
        chip.className = 'chip' + (p.id === calendarioPerfilId ? ' activo' : '');
        chip.textContent = p.nombre;
        chip.onclick = () => seleccionarPersonaCalendario(p.id);
        contenedor.appendChild(chip);
    });
}

async function seleccionarPersonaCalendario(id) {
    calendarioPerfilId = id;
    pintarSelectorPersonas();
    await pintarCalendario();
}

async function cambiarMesCalendario(delta) {
    calendarioViewDate.setMonth(calendarioViewDate.getMonth() + delta);
    await pintarCalendario();
}

async function cargarDiasDelMes(perfilId, year, month) {
    const inicio = new Date(year, month, 1, 0, 0, 0, 0).toISOString();
    const fin = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();

    const { data, error } = await sb
        .from('asistencias')
        .select('creado_en')
        .eq('perfil_id', perfilId)
        .gte('creado_en', inicio)
        .lte('creado_en', fin);

    if (error) {
        console.error(error);
        return new Set();
    }

    const dias = new Set();
    data.forEach(a => dias.add(new Date(a.creado_en).getDate()));
    return dias;
}

async function pintarCalendario() {
    const label = document.getElementById('calendario-mes-label');
    label.textContent = calendarioViewDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    const grid = document.getElementById('calendario-grid');
    if (!calendarioPerfilId) {
        grid.innerHTML = "<p>Elige a alguien de arriba.</p>";
        return;
    }

    const year = calendarioViewDate.getFullYear();
    const month = calendarioViewDate.getMonth();
    const diasConFichaje = await cargarDiasDelMes(calendarioPerfilId, year, month);

    const hoy = new Date();
    const numDias = new Date(year, month + 1, 0).getDate();
    const primerDiaSemana = new Date(year, month, 1).getDay();

    grid.innerHTML = "";
    ['D', 'L', 'M', 'X', 'J', 'V', 'S'].forEach(d => {
        const cab = document.createElement('div');
        cab.className = 'dia-cabecera';
        cab.textContent = d;
        grid.appendChild(cab);
    });
    for (let i = 0; i < primerDiaSemana; i++) {
        grid.appendChild(document.createElement('div'));
    }
    for (let d = 1; d <= numDias; d++) {
        const celda = document.createElement('div');
        const fechaCelda = new Date(year, month, d);
        const esFuturo = fechaCelda > hoy && fechaCelda.toDateString() !== hoy.toDateString();

        celda.className = 'dia-celda';
        if (esFuturo) {
            celda.classList.add('futuro');
            celda.innerHTML = `<span class="num-dia">${d}</span>`;
        } else if (diasConFichaje.has(d)) {
            celda.classList.add('verde');
            celda.innerHTML = `<span class="num-dia">${d}</span><span class="tic">✔</span>`;
        } else {
            celda.classList.add('rojo');
            celda.innerHTML = `<span class="num-dia">${d}</span><span class="tic">✘</span>`;
        }
        grid.appendChild(celda);
    }
}

// 10. PESTAÑA "ESTADÍSTICAS" (gráfico + ranking mensual)
let statsViewDate = new Date();
let chartInstancia = null;

async function cambiarMesStats(delta) {
    statsViewDate.setMonth(statsViewDate.getMonth() + delta);
    await pintarStatsMes();
}

async function cargarConteoDelMes(year, month) {
    const inicio = new Date(year, month, 1, 0, 0, 0, 0).toISOString();
    const fin = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();

    const { data, error } = await sb
        .from('asistencias')
        .select('perfil_id, creado_en')
        .gte('creado_en', inicio)
        .lte('creado_en', fin);

    if (error) {
        console.error(error);
        return {};
    }

    // Agrupamos por persona y contamos días distintos, no filas sueltas
    const diasPorPerfil = {};
    data.forEach(a => {
        const dia = new Date(a.creado_en).toDateString();
        if (!diasPorPerfil[a.perfil_id]) diasPorPerfil[a.perfil_id] = new Set();
        diasPorPerfil[a.perfil_id].add(dia);
    });

    const conteo = {};
    Object.keys(diasPorPerfil).forEach(id => { conteo[id] = diasPorPerfil[id].size; });
    return conteo;
}

async function pintarStatsMes() {
    const label = document.getElementById('stats-mes-label');
    label.textContent = statsViewDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    const conteo = await cargarConteoDelMes(statsViewDate.getFullYear(), statsViewDate.getMonth());
    const ranking = todosLosPerfiles
        .map(p => ({ nombre: p.nombre, total: conteo[p.id] || 0 }))
        .sort((a, b) => b.total - a.total);

    const contenedor = document.getElementById('ranking-lista');
    contenedor.innerHTML = "";
    ranking.forEach(r => {
        const fila = document.createElement('div');
        fila.className = 'ranking-fila';
        fila.innerHTML = `<span>${r.nombre}</span><span>${r.total} ${r.total === 1 ? 'día' : 'días'}</span>`;
        contenedor.appendChild(fila);
    });

    const ctx = document.getElementById('grafico-stats').getContext('2d');
    if (chartInstancia) chartInstancia.destroy();
    chartInstancia = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ranking.map(r => r.nombre),
            datasets: [{
                label: 'Días este mes',
                data: ranking.map(r => r.total),
                backgroundColor: '#4CAF50',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#ccc' }, grid: { color: '#2a2a2a' } },
                y: { beginAtZero: true, ticks: { color: '#ccc', stepSize: 1 }, grid: { color: '#2a2a2a' } }
            }
        }
    });
}

// 11. PESTAÑA "ADMIN" (solo el líder): aprobar cuentas nuevas
async function pintarPendientes() {
    const contenedor = document.getElementById('lista-pendientes');
    contenedor.innerHTML = "<p>Cargando...</p>";

    const { data, error } = await sb
        .from('perfiles')
        .select('id, nombre')
        .eq('aprobado', false)
        .order('nombre');

    if (error) {
        contenedor.innerHTML = "<p>Error al cargar las solicitudes.</p>";
        console.error(error);
        return;
    }

    if (data.length === 0) {
        contenedor.innerHTML = "<p>No hay nadie esperando aprobación ahora mismo.</p>";
        return;
    }

    contenedor.innerHTML = "";
    data.forEach(p => {
        const fila = document.createElement('div');
        fila.className = 'ranking-fila';
        fila.innerHTML = `<span>${p.nombre}</span>`;
        const btn = document.createElement('button');
        btn.textContent = "Aprobar ✅";
        btn.className = 'btn-small btn-aprobar';
        btn.onclick = () => aprobarPersona(p.id);
        fila.appendChild(btn);
        contenedor.appendChild(fila);
    });
}

async function aprobarPersona(id) {
    const { error } = await sb.from('perfiles').update({ aprobado: true }).eq('id', id);
    if (error) {
        alert("Error al aprobar: " + error.message);
        return;
    }
    await pintarPendientes();
}
