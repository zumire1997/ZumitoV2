import 'dotenv/config';
import { 
    Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ApplicationCommandOptionType, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, StringSelectMenuBuilder, 
    MessageFlags, ChannelType, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import fs from 'fs';

const dbFile = './database.json';
const pedidosTemp = new Map(); 

const rolesPermitidos = ['AQUÍ_PEGA_TU_ID']; 

function esAdmin(interaction) {
    if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return true;
    if (interaction.member?.roles?.cache) {
        return rolesPermitidos.some(idRol => interaction.member.roles.cache.has(idRol));
    }
    return false;
}

function leerBaseDeDatos() {
    if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ proyectos: {} }));
    const data = JSON.parse(fs.readFileSync(dbFile));
    if (!data.proyectos) data.proyectos = {};
    
    for (const key in data.proyectos) {
        if (!data.proyectos[key].stats) {
            data.proyectos[key].stats = {
                clean: { libres: 0, proceso: 0, revisar: 0, aprobados: 0 },
                tradu: { libres: 0, proceso: 0, revisar: 0, aprobados: 0 },
                type: { bloqueados: 0, libres: 0, proceso: 0, revisar: 0, aprobados: 0 }
            };
        }
        if (data.proyectos[key].enlace_drive === undefined) data.proyectos[key].enlace_drive = "No asignado";
        if (data.proyectos[key].enlace_web === undefined) data.proyectos[key].enlace_web = "";
        if (data.proyectos[key].generos === undefined) data.proyectos[key].generos = "";
        if (data.proyectos[key].etiqueta_extra === undefined) data.proyectos[key].etiqueta_extra = "";
    }
    return data;
}

function guardarBaseDeDatos(datos) { fs.writeFileSync(dbFile, JSON.stringify(datos, null, 4)); }

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('clientReady', async () => {
    console.log(`🍇 ¡Éxito! ${client.user.tag} ha despertado y está listo.`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: [
            { name: 'perfil', description: 'Mira tu perfil y puntos acumulados' },
            { 
                name: 'registrar', 
                description: 'Envía una solicitud de capítulos terminados', 
                options: [
                    { name: 'proyecto', description: 'Selecciona el proyecto', type: ApplicationCommandOptionType.String, required: true, autocomplete: true },
                    { name: 'capitulos', description: 'Separados por comas (Ej: 15, 16)', type: ApplicationCommandOptionType.String, required: true },
                    { name: 'rol', description: 'Tu trabajo', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: '🖌️ Clean', value: 'clean' }, { name: '📝 Traducción', value: 'tradu' }, { name: '🌸 Typeset', value: 'type' }] }
                ] 
            },
            { name: 'pedir', description: 'Panel para solicitar un capítulo' },
            { 
                name: 'crear_proyecto', 
                description: '[Admin] Crear proyecto', 
                options: [
                    { name: 'nombre', description: 'El título de la obra', type: ApplicationCommandOptionType.String, required: true },
                    { name: 'portada', description: 'Sube la imagen de portada', type: ApplicationCommandOptionType.Attachment, required: true },
                    { name: 'canal', description: 'Canal de Discord vinculado', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText], required: true },
                    { name: 'enlace_drive', description: 'Link de la carpeta maestra en Google Drive', type: ApplicationCommandOptionType.String, required: true },
                    { name: 'enlace_web', description: 'Link web oficial de lectura (Opcional)', type: ApplicationCommandOptionType.String, required: false },
                    { name: 'generos', description: 'Ej: BL, Erótico, Drama (Opcional)', type: ApplicationCommandOptionType.String, required: false },
                    { name: 'etiqueta_extra', description: 'Ej: SIN CENSURA 🔥 (Opcional)', type: ApplicationCommandOptionType.String, required: false }
                ]
            },
            { 
                name: 'editar_proyecto', 
                description: '[Admin] Edita los datos de un proyecto sin perder su progreso', 
                options: [
                    { name: 'proyecto', description: 'Selecciona el proyecto a editar', type: ApplicationCommandOptionType.String, required: true, autocomplete: true },
                    { name: 'nuevo_nombre', description: 'Cambiar el título de la obra', type: ApplicationCommandOptionType.String, required: false },
                    { name: 'nueva_portada', description: 'Cambiar la imagen de portada', type: ApplicationCommandOptionType.Attachment, required: false },
                    { name: 'nuevo_canal', description: 'Cambiar el canal vinculado', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText], required: false },
                    { name: 'nuevo_enlace_drive', description: 'Cambiar el link de Drive', type: ApplicationCommandOptionType.String, required: false },
                    { name: 'nuevo_enlace_web', description: 'Cambiar el link web de lectura', type: ApplicationCommandOptionType.String, required: false },
                    { name: 'nuevos_generos', description: 'Cambiar los géneros', type: ApplicationCommandOptionType.String, required: false },
                    { name: 'nueva_etiqueta', description: 'Cambiar la etiqueta extra', type: ApplicationCommandOptionType.String, required: false }
                ]
            },
            { name: 'agregar_caps', description: '[Admin] Agregar caps mediante lista' },
            { name: 'eliminar_proyecto', description: '[Admin] Elimina un proyecto del inventario' },
            { name: 'ranking', description: 'Muestra la tabla de posiciones del staff' },
            { name: 'registrar_correo', description: 'Vincula tu correo de Gmail para obtener accesos de trabajo', options: [{ name: 'correo', description: 'Tu dirección de correo electrónico', type: ApplicationCommandOptionType.String, required: true }] },
            { name: 'lista_correos', description: '[Admin] Muestra el directorio de correos del staff' },
            { name: 'reporte', description: '[Admin] Muestra el panel de progreso de forma invisible' },
            { name: 'reiniciar_mes', description: '[Admin] Reinicia los puntos de todos a cero para empezar un nuevo mes' },
            {
                name: 'info',
                description: 'Muestra la guía de uso de los comandos de Zumito',
                options: [{ name: 'tipo', description: 'Selecciona la guía que deseas ver', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: '👥 Guía de Staff', value: 'staff' }, { name: '👑 Guía de Admin', value: 'admin' }] }]
            },
            {
                name: 'publicar',
                description: '[Admin] Publica un anuncio de capítulos con estado personalizado',
                options: [
                    { name: 'proyecto', description: 'Selecciona el proyecto', type: ApplicationCommandOptionType.String, required: true, autocomplete: true },
                    { name: 'estado', description: 'Tipo de publicación', type: ApplicationCommandOptionType.String, required: true, choices: [
                        { name: '✨ ACTUALIZACIÓN', value: 'ACTUALIZACIÓN' },
                        { name: '🚀 ESTRENO', value: 'ESTRENO' },
                        { name: '🏁 FINALIZADO', value: 'FINALIZADO' }
                    ]},
                    { name: 'capitulos', description: 'Número de capítulo(s) (Ej: 02, o 15 al 17)', type: ApplicationCommandOptionType.String, required: true },
                    { name: 'canal', description: '¿Dónde se anuncia?', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText], required: true },
                    { name: 'enlace_alternativo', description: 'Usa un link distinto al guardado (Opcional)', type: ApplicationCommandOptionType.String, required: false },
                    { name: 'mencion', description: '¿A quién etiquetar?', type: ApplicationCommandOptionType.String, required: false, choices: [{name: '@everyone', value: '@everyone'}, {name: '@here', value: '@here'}, {name: 'Sin mención', value: ''}] }
                ]
            }
        ]});
        console.log('✅ Comandos registrados correctamente.');
    } catch (error) { 
        console.error('Error registrando comandos:', error); 
    }
});

client.on('interactionCreate', async interaction => {
    
    try {
        if (interaction.isAutocomplete()) {
            if (interaction.commandName === 'registrar' || interaction.commandName === 'publicar' || interaction.commandName === 'editar_proyecto') {
                const focusedValue = interaction.options.getFocused();
                const db = leerBaseDeDatos();
                const proyectos = Object.keys(db.proyectos);
                const filtrados = proyectos.filter(p => p.toLowerCase().includes(focusedValue.toLowerCase())).slice(0, 25);
                await interaction.respond(filtrados.map(choice => ({ name: choice, value: choice })));
            }
            return;
        }

        if (interaction.isChatInputCommand()) {

            if (interaction.commandName === 'editar_proyecto') {
                if (!esAdmin(interaction)) return interaction.reply({ content: '❌ Solo admins de proyectos.', flags: MessageFlags.Ephemeral });

                const nombreActual = interaction.options.getString('proyecto');
                const db = leerBaseDeDatos();

                if (!db.proyectos[nombreActual]) {
                    return interaction.reply({ content: '⚠️ Ese proyecto no existe en la base de datos.', flags: MessageFlags.Ephemeral });
                }

                const nuevoNombre = interaction.options.getString('nuevo_nombre');
                const nuevaPortada = interaction.options.getAttachment('nueva_portada');
                const nuevoCanal = interaction.options.getChannel('nuevo_canal');
                const nuevoEnlaceDrive = interaction.options.getString('nuevo_enlace_drive');
                const nuevoEnlaceWeb = interaction.options.getString('nuevo_enlace_web');
                const nuevosGeneros = interaction.options.getString('nuevos_generos');
                const nuevaEtiqueta = interaction.options.getString('nueva_etiqueta');

                let proyectoTarget = db.proyectos[nombreActual];

                if (nuevaPortada) {
                    if (!nuevaPortada.contentType.startsWith('image/')) {
                        return interaction.reply({ content: '❌ La nueva portada debe ser una imagen.', flags: MessageFlags.Ephemeral });
                    }
                    proyectoTarget.imagen = nuevaPortada.url;
                }
                if (nuevoCanal) proyectoTarget.canalId = nuevoCanal.id;
                if (nuevoEnlaceDrive) proyectoTarget.enlace_drive = nuevoEnlaceDrive;
                if (nuevoEnlaceWeb !== null) proyectoTarget.enlace_web = nuevoEnlaceWeb;
                if (nuevosGeneros !== null) proyectoTarget.generos = nuevosGeneros;
                if (nuevaEtiqueta !== null) proyectoTarget.etiqueta_extra = nuevaEtiqueta;

                let nombreFinal = nombreActual;
                if (nuevoNombre && nuevoNombre !== nombreActual) {
                    if (db.proyectos[nuevoNombre]) {
                        return interaction.reply({ content: `⚠️ Ya existe un proyecto llamado **${nuevoNombre}**.`, flags: MessageFlags.Ephemeral });
                    }
                    db.proyectos[nuevoNombre] = proyectoTarget;
                    delete db.proyectos[nombreActual];
                    nombreFinal = nuevoNombre;
                }

                guardarBaseDeDatos(db);
                await interaction.reply({ content: `✅ Proyecto **${nombreFinal}** actualizado correctamente.`, flags: MessageFlags.Ephemeral });
            }
            
            if (interaction.commandName === 'publicar') {
                if (!esAdmin(interaction)) return interaction.reply({ content: '❌ Solo admins de proyectos.', flags: MessageFlags.Ephemeral });

                const nombreProyecto = interaction.options.getString('proyecto');
                const db = leerBaseDeDatos();
                const proyInfo = db.proyectos[nombreProyecto];

                if (!proyInfo) {
                    return interaction.reply({ content: '⚠️ Proyecto no encontrado en la base de datos.', flags: MessageFlags.Ephemeral });
                }

                const estado = interaction.options.getString('estado'); 
                const capitulos = interaction.options.getString('capitulos');
                const enlaceAlternativo = interaction.options.getString('enlace_alternativo');
                const canalDestino = interaction.options.getChannel('canal');
                const mencion = interaction.options.getString('mencion') || '';

                const enlaceFinal = enlaceAlternativo || proyInfo.enlace_web || 'Enlace no configurado';
                const generos = proyInfo.generos;
                const etiquetaExtra = proyInfo.etiqueta_extra;
                const imagenUrl = proyInfo.imagen;

                let mensajeAnuncio = `${mencion}\n`;
                mensajeAnuncio += `- ˏˋ ✧ **${estado}** ✧ ˎˊ -\n`;
                mensajeAnuncio += `︶︶︶︶︶︶︶︶ # Zumi Scan\n\n`;
                mensajeAnuncio += `🔺 **${nombreProyecto}** 🔺\n`;
                
                if (etiquetaExtra) {
                    mensajeAnuncio += `${etiquetaExtra}\n`;
                }
                mensajeAnuncio += `\n`;
                
                if (generos) {
                    mensajeAnuncio += `₊˚♡ Géneros: ${generos}\n\n`;
                }
                
                mensajeAnuncio += `✦ Capítulo(s): ${capitulos}\n\n`;
                mensajeAnuncio += `➤ Disponible en: ${enlaceFinal}\n\n`;
                mensajeAnuncio += `✧˖°. Hecho con mucho amorcito~\n`;
                mensajeAnuncio += `.✧ No olviden dejar su reacción ♡`;

                const imagenEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setImage(imagenUrl);

                try {
                    await canalDestino.send({ content: mensajeAnuncio, embeds: [imagenEmbed] });
                    await interaction.reply({ content: `✅ ¡Anuncio de tipo **${estado}** publicado en <#${canalDestino.id}>!`, flags: MessageFlags.Ephemeral });
                } catch (err) {
                    await interaction.reply({ content: `❌ No pude publicar. Verifica que Zumito tenga permisos en <#${canalDestino.id}>.`, flags: MessageFlags.Ephemeral });
                }
            }

            if (interaction.commandName === 'reiniciar_mes') {
                if (!esAdmin(interaction)) return interaction.reply({ content: '❌ Solo admins.', flags: MessageFlags.Ephemeral });
                const botonesConfirmacion = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('confirmar_reinicio_mes').setLabel('Sí, borrar todos los puntos').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('cancelar_reinicio_mes').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
                );
                await interaction.reply({ content: '⚠️ ¿Estás segura de reiniciar los puntos del mes?', components: [botonesConfirmacion], flags: MessageFlags.Ephemeral });
            }

            if (interaction.commandName === 'info') {
                const tipoGuia = interaction.options.getString('tipo');
                const infoEmbed = new EmbedBuilder().setColor('#9b59b6');

                if (tipoGuia === 'staff') {
                    infoEmbed.setTitle('📖 Guía de Zumito para el Staff')
                        .setDescription('**`/pedir`**\n↳ En canales de proyectos para tomar capítulos.\n\n**`/registrar`**\n↳ En `#registro` para reportar trabajos terminados.\n\n**`/perfil`**\n↳ En `#ver-perfil` para ver tus puntos.\n\n**`/ranking`**\n↳ Muestra la tabla de posiciones.\n\n**`/registrar_correo`**\n↳ En `#correos` para vincular tu Gmail.');
                } else if (tipoGuia === 'admin') {
                    if (!esAdmin(interaction)) return interaction.reply({ content: '❌ Solo administradores.', flags: MessageFlags.Ephemeral });
                    infoEmbed.setTitle('👑 Guía de Zumito para Administradores')
                        .setColor('#e67e22')
                        .setDescription('**`/crear_proyecto`** y **`/editar_proyecto`**\n↳ Administra obras, enlaces web, Drive y estética.\n\n**`/agregar_caps`**\n↳ Añade stock de capítulos.\n\n**`/publicar`**\n↳ Envía anuncios públicos como Actualización, Estreno o Finalizado con imagen integrada.\n\n**`/reporte`**\n↳ Panel de progreso invisible.');
                }
                await interaction.reply({ embeds: [infoEmbed], flags: MessageFlags.Ephemeral });
            }

            if (interaction.commandName === 'perfil') {
                const db = leerBaseDeDatos();
                const userId = interaction.user.id;
                if (!db[userId]) { db[userId] = { clean: 0, tradu: 0, type: 0 }; guardarBaseDeDatos(db); }
                const stats = db[userId];
                const total = stats.clean + stats.tradu + stats.type;
                const profileEmbed = new EmbedBuilder().setColor('#9b59b6').setTitle(`Perfil de ${interaction.user.username}`).setThumbnail(interaction.user.displayAvatarURL({ dynamic: true })).setDescription(`**↳ Puntos Acumulados**\n**Total:** ${total} pts\n🖌️ Clean: ${stats.clean} | 📝 Tradu: ${stats.tradu} | 🌸 Type: ${stats.type}`);
                await interaction.reply({ embeds: [profileEmbed], flags: MessageFlags.Ephemeral });
            }

            if (interaction.commandName === 'ranking') {
                const db = leerBaseDeDatos();
                const usuarios = [];
                for (const [userId, stats] of Object.entries(db)) {
                    if (userId === 'proyectos') continue; 
                    const total = stats.clean + stats.tradu + stats.type;
                    if (total > 0) usuarios.push({ userId, total, clean: stats.clean, tradu: stats.tradu, type: stats.type });
                }
                usuarios.sort((a, b) => b.total - a.total);
                if (usuarios.length === 0) return interaction.reply({ content: '🏆 Sin puntos aún.', flags: MessageFlags.Ephemeral });
                let rankingText = '';
                const medallas = ['🥇', '🥈', '🥉'];
                for (let i = 0; i < usuarios.length; i++) {
                    if (i >= 15) break; 
                    const u = usuarios[i];
                    const medalla = i < 3 ? medallas[i] : '🏅'; 
                    rankingText += `${medalla} <@${u.userId}>: **${u.total} pts** *(C: ${u.clean} / Tr: ${u.tradu} / Ty: ${u.type})*\n`;
                }
                const rankingEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle('🏆 RANKING DE STAFF').setDescription(rankingText);
                await interaction.reply({ embeds: [rankingEmbed] });
            }

            if (interaction.commandName === 'registrar_correo') {
                const correoIngresado = interaction.options.getString('correo');
                if (!correoIngresado.includes('@')) return interaction.reply({ content: '❌ Correo inválido.', flags: MessageFlags.Ephemeral });
                const db = leerBaseDeDatos();
                const userId = interaction.user.id;
                if (!db[userId]) db[userId] = { clean: 0, tradu: 0, type: 0 }; 
                db[userId].correo = correoIngresado;
                guardarBaseDeDatos(db);
                await interaction.reply({ content: `✅ Correo vinculado.`, flags: MessageFlags.Ephemeral });
            }

            if (interaction.commandName === 'lista_correos') {
                if (!esAdmin(interaction)) return interaction.reply({ content: '❌ Solo admins.', flags: MessageFlags.Ephemeral });
                const db = leerBaseDeDatos();
                let listaFormateada = '';
                for (const [userId, datos] of Object.entries(db)) {
                    if (userId !== 'proyectos' && datos.correo) listaFormateada += `• <@${userId}> : \`${datos.correo}\`\n`;
                }
                if (listaFormateada === '') return interaction.reply({ content: '📭 Directorio vacío.', flags: MessageFlags.Ephemeral });
                const directorioEmbed = new EmbedBuilder().setColor('#2980b9').setTitle('📧 Directorio de Correos').setDescription(listaFormateada);
                await interaction.reply({ embeds: [directorioEmbed], flags: MessageFlags.Ephemeral });
            }

            if (interaction.commandName === 'crear_proyecto') {
                if (!esAdmin(interaction)) return interaction.reply({ content: '❌ Solo admins.', flags: MessageFlags.Ephemeral });
                const nombreProyecto = interaction.options.getString('nombre');
                const portada = interaction.options.getAttachment('portada');
                const canalVinculado = interaction.options.getChannel('canal'); 
                const enlaceDrive = interaction.options.getString('enlace_drive'); 
                const enlaceWeb = interaction.options.getString('enlace_web') || '';
                const generos = interaction.options.getString('generos') || '';
                const etiquetaExtra = interaction.options.getString('etiqueta_extra') || '';

                if (!portada.contentType.startsWith('image/')) return interaction.reply({ content: '❌ Sube una imagen válida.', flags: MessageFlags.Ephemeral });
                const db = leerBaseDeDatos();
                if (db.proyectos[nombreProyecto]) return interaction.reply({ content: '⚠️ Ya existe.', flags: MessageFlags.Ephemeral });
                
                db.proyectos[nombreProyecto] = {
                    imagen: portada.url,
                    canalId: canalVinculado.id, 
                    enlace_drive: enlaceDrive, 
                    enlace_web: enlaceWeb,
                    generos: generos,
                    etiqueta_extra: etiquetaExtra,
                    capitulosDisponibles: [],
                    stats: {
                        clean: { libres: 0, proceso: 0, revisar: 0, aprobados: 0 },
                        tradu: { libres: 0, proceso: 0, revisar: 0, aprobados: 0 },
                        type: { bloqueados: 0, libres: 0, proceso: 0, revisar: 0, aprobados: 0 }
                    }
                };
                guardarBaseDeDatos(db);
                const exitoEmbed = new EmbedBuilder().setColor('#e67e22').setTitle('📚 ¡Nuevo Proyecto!').setDescription(`Se creó **${nombreProyecto}** vinculado a <#${canalVinculado.id}>.`).setImage(portada.url);
                await interaction.reply({ embeds: [exitoEmbed] });
            }

            if (interaction.commandName === 'eliminar_proyecto') {
                if (!esAdmin(interaction)) return interaction.reply({ content: '❌ Solo admins.', flags: MessageFlags.Ephemeral });
                const db = leerBaseDeDatos();
                const proyectos = Object.keys(db.proyectos);
                if (proyectos.length === 0) return interaction.reply({ content: '⚠️ No hay proyectos.', flags: MessageFlags.Ephemeral });
                const menuEliminar = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_proyecto_eliminar').setPlaceholder('Selecciona el proyecto a ELIMINAR ——').addOptions(proyectos.map(p => new StringSelectMenuOptionBuilder().setLabel(p).setValue(p))));
                await interaction.reply({ content: '⚠️ Selecciona el proyecto a eliminar:', components: [menuEliminar], flags: MessageFlags.Ephemeral });
            }

            if (interaction.commandName === 'agregar_caps') {
                if (!esAdmin(interaction)) return interaction.reply({ content: '❌ Solo admins.', flags: MessageFlags.Ephemeral });
                const db = leerBaseDeDatos();
                const proyectos = Object.keys(db.proyectos);
                if (proyectos.length === 0) return interaction.reply({ content: '⚠️ No hay proyectos.', flags: MessageFlags.Ephemeral });
                const menuProyectos = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_proyecto_caps').setPlaceholder('Selecciona un proyecto ——').addOptions(proyectos.map(p => new StringSelectMenuOptionBuilder().setLabel(p).setValue(p))));
                await interaction.reply({ content: 'Selecciona el proyecto:', components: [menuProyectos], flags: MessageFlags.Ephemeral });
            }

            if (interaction.commandName === 'pedir') {
                const db = leerBaseDeDatos();
                let esCanalDeProyecto = false;
                for (const datos of Object.values(db.proyectos)) {
                    if (datos.canalId === interaction.channelId) esCanalDeProyecto = true;
                }
                if (!esCanalDeProyecto) return interaction.reply({ content: '⚠️ Usa este comando en el canal del proyecto.', flags: MessageFlags.Ephemeral });
                
                const menuRol = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_roles').setPlaceholder('Selecciona el Rol ——').addOptions([{ label: '🖌️ Clean', value: 'Clean' }, { label: '📝 Traducción', value: 'Traducción' }, { label: '🌸 Typeset', value: 'Typeset' }]));
                const menuTiempo = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_tiempo').setPlaceholder('Tiempo estimado ——').addOptions([{ label: '💖 Inmediata', value: 'Inmediata' }, { label: '🍂 12 Horas', value: '12 Horas' }, { label: '🌿 3 Días', value: '3 Días' }]));
                
                const botonConfirmar = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('confirmar_pedido').setLabel('Confirmar ⋆').setStyle(ButtonStyle.Secondary));
                const panelEmbed = new EmbedBuilder().setColor('#2c3e50').setTitle('⋆ Panel Zumito 🍇 ✧').setDescription('Selecciona tus preferencias y solicita tu capítulo.');
                await interaction.reply({ embeds: [panelEmbed], components: [menuRol, menuTiempo, botonConfirmar], flags: MessageFlags.Ephemeral });
            }

            if (interaction.commandName === 'registrar') {
                const proyecto = interaction.options.getString('proyecto');
                const capitulos = interaction.options.getString('capitulos');
                const rol = interaction.options.getString('rol'); 
                const userId = interaction.user.id;
                
                const arrayCaps = capitulos.split(',').map(c => c.trim()).filter(c => c !== '');
                const cantidad = arrayCaps.length;

                if (cantidad === 0) return interaction.reply({ content: '❌ Ingresa al menos un capítulo.', flags: MessageFlags.Ephemeral });

                const db = leerBaseDeDatos();
                if (!db.proyectos[proyecto]) return interaction.reply({ content: '⚠️ Proyecto no encontrado.', flags: MessageFlags.Ephemeral });

                if (db.proyectos[proyecto].stats[rol].proceso >= cantidad) {
                    db.proyectos[proyecto].stats[rol].proceso -= cantidad;
                } else {
                    db.proyectos[proyecto].stats[rol].proceso = 0;
                }
                db.proyectos[proyecto].stats[rol].revisar += cantidad;
                guardarBaseDeDatos(db);

                const botones = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`aprobar_${userId}_${rol}_${cantidad}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`rechazar_${userId}_${rol}_${cantidad}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
                );
                
                const pendienteEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle('⏳ Solicitud Pendiente').addFields([{ name: '👤 Miembro', value: `<@${userId}>`, inline: true }, { name: '📚 Proyecto', value: proyecto, inline: true }, { name: '\u200B', value: '\u200B', inline: true }, { name: '⚙️ Rol', value: rol.toUpperCase(), inline: true }, { name: '📄 Capítulos', value: arrayCaps.join(', '), inline: true }, { name: '⚡ Puntos a sumar', value: cantidad.toString(), inline: true }]);
                await interaction.reply({ embeds: [pendienteEmbed], components: [botones] });
            }

            if (interaction.commandName === 'reporte') {
                if (!esAdmin(interaction)) return interaction.reply({ content: '❌ Solo admins.', flags: MessageFlags.Ephemeral });
                const db = leerBaseDeDatos();
                let proyectoActual = null;
                let nombreProyectoActual = "";

                for (const [nombre, datos] of Object.entries(db.proyectos)) {
                    if (datos.canalId === interaction.channelId) {
                        proyectoActual = datos;
                        nombreProyectoActual = nombre;
                        break;
                    }
                }

                if (!proyectoActual) return interaction.reply({ content: '⚠️ Usa este comando en el canal del proyecto.', flags: MessageFlags.Ephemeral });
                const s = proyectoActual.stats;
                const reporteEmbed = new EmbedBuilder()
                    .setTitle('📊 REPORTE DE STAFF')
                    .setColor('#2b2d31')
                    .addFields(
                        { name: '🧹 CLEAN', value: `🟢 Libres: ${s.clean.libres}\n🟡 En proceso: ${s.clean.proceso}\n✅ Aprobados: ${s.clean.aprobados}` },
                        { name: '📝 TRADU', value: `🟢 Libres: ${s.tradu.libres}\n🟡 En proceso: ${s.tradu.proceso}\n🔴 Por revisar: ${s.tradu.revisar}` },
                        { name: '🎨 TYPE', value: `🔒 Bloqueados: ${s.type.bloqueados}\n🟢 Disponibles: ${s.type.libres}\n🟡 En proceso: ${s.type.proceso}\n🔴 Por revisar: ${s.type.revisar}` }
                    )
                    .setFooter({ text: nombreProyectoActual });
                
                await interaction.reply({ embeds: [reporteEmbed], flags: MessageFlags.Ephemeral });
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'select_proyecto_eliminar') {
                const nombreProyecto = interaction.values[0];
                const db = leerBaseDeDatos();
                if (db.proyectos[nombreProyecto]) {
                    delete db.proyectos[nombreProyecto];
                    guardarBaseDeDatos(db);
                    await interaction.update({ content: `🗑️ **${nombreProyecto}** eliminado.`, components: [] });
                }
                return;
            }

            if (interaction.customId === 'select_proyecto_caps') {
                const nombreProyecto = interaction.values[0];
                const modal = new ModalBuilder().setCustomId(`modal_caps_${nombreProyecto}`).setTitle(`Caps para: ${nombreProyecto}`);
                const input = new TextInputBuilder().setCustomId('input_caps').setLabel('Escribe los capítulos (Ej: 10, 11, 12)').setStyle(TextInputStyle.Short);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                return; 
            }

            const userId = interaction.user.id;
            if (!pedidosTemp.has(userId)) pedidosTemp.set(userId, { rol: null, tiempo: null });
            const datosUsuario = pedidosTemp.get(userId);
            if (interaction.customId === 'menu_roles') datosUsuario.rol = interaction.values[0];
            if (interaction.customId === 'menu_tiempo') datosUsuario.tiempo = interaction.values[0];
            
            await interaction.deferUpdate(); 
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('modal_caps_')) {
                const nombreProyecto = interaction.customId.replace('modal_caps_', '');
                const capsNuevosStr = interaction.fields.getTextInputValue('input_caps');
                const db = leerBaseDeDatos();

                const arrayNuevos = capsNuevosStr.split(',').map(c => c.trim()).filter(c => c !== '');
                const cantidadAgregada = arrayNuevos.length;

                db.proyectos[nombreProyecto].capitulosDisponibles.push(...arrayNuevos);
                db.proyectos[nombreProyecto].stats.clean.libres += cantidadAgregada;
                db.proyectos[nombreProyecto].stats.tradu.libres += cantidadAgregada;
                db.proyectos[nombreProyecto].stats.type.bloqueados += cantidadAgregada;
                guardarBaseDeDatos(db);

                await interaction.reply({ content: `✅ Capítulos **${arrayNuevos.join(', ')}** agregados.`, flags: MessageFlags.Ephemeral });

                const canalId = db.proyectos[nombreProyecto].canalId;
                const canal = await client.channels.fetch(canalId).catch(() => null);
                if (canal) {
                    const alertaEmbed = new EmbedBuilder().setColor('#f39c12').setTitle('🔔 ¡Nuevos Capítulos Disponibles!').setDescription(`Agregados: **${arrayNuevos.join(', ')}**.\nUsen \`/pedir\` para tomarlos.`);
                    await canal.send({ embeds: [alertaEmbed] });
                }
            }
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'confirmar_reinicio_mes') {
                if (!esAdmin(interaction)) return;
                const db = leerBaseDeDatos();
                for (const userId in db) {
                    if (userId !== 'proyectos') {
                        db[userId].clean = 0;
                        db[userId].tradu = 0;
                        db[userId].type = 0;
                    }
                }
                guardarBaseDeDatos(db);
                await interaction.update({ content: '✅ Puntos de todo el staff reseteados a 0.', components: [] });
            }

            if (interaction.customId === 'cancelar_reinicio_mes') {
                await interaction.update({ content: '❌ Operación cancelada.', components: [] });
            }

            if (interaction.customId === 'confirmar_pedido') {
                const userId = interaction.user.id;
                const datosUsuario = pedidosTemp.get(userId);

                if (!datosUsuario || !datosUsuario.rol || !datosUsuario.tiempo) {
                    return interaction.followUp({ content: '⚠️ Selecciona opciones en los menús.', flags: MessageFlags.Ephemeral });
                }

                const db = leerBaseDeDatos();
                let proyectoActual = null;
                let nombreProyectoActual = "";

                for (const [nombre, datos] of Object.entries(db.proyectos)) {
                    if (datos.canalId === interaction.channelId) {
                        proyectoActual = datos;
                        nombreProyectoActual = nombre;
                        break;
                    }
                }

                if (proyectoActual.capitulosDisponibles.length === 0) {
                    return interaction.followUp({ content: `↳ No hay capítulos disponibles para **${datosUsuario.rol}** 😿`, flags: MessageFlags.Ephemeral });
                }

                const rolMap = { 'Clean': 'clean', 'Traducción': 'tradu', 'Typeset': 'type' };
                const rolKey = rolMap[datosUsuario.rol];

                if (rolKey === 'type') {
                    if (proyectoActual.stats.type.libres > 0) proyectoActual.stats.type.libres--;
                    else if (proyectoActual.stats.type.bloqueados > 0) proyectoActual.stats.type.bloqueados--; 
                } else {
                    if (proyectoActual.stats[rolKey].libres > 0) proyectoActual.stats[rolKey].libres--;
                }
                proyectoActual.stats[rolKey].proceso++;

                const capAsignado = proyectoActual.capitulosDisponibles.shift();
                guardarBaseDeDatos(db);

                const canalDelProyecto = await client.channels.fetch(interaction.channelId).catch(() => null);
                if (canalDelProyecto) {
                    const alertaPublica = new EmbedBuilder().setColor('#3498db').setTitle('📢 Asignación Tomada').setDescription(`El usuario <@${userId}> tomó el **Capítulo ${capAsignado}** de ${nombreProyectoActual}.\n\n**Rol:** ${datosUsuario.rol}`);
                    await canalDelProyecto.send({ embeds: [alertaPublica] });
                }

                const linkFormateado = (proyectoActual.enlace_drive && proyectoActual.enlace_drive.startsWith('http')) 
                    ? `[Haz clic aquí para abrir Drive](${proyectoActual.enlace_drive})` 
                    : (proyectoActual.enlace_drive || 'No configurado');

                const confirmacionPrivada = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('✅ ¡Asignación Confirmada!')
                    .setDescription(`Se te asignó el **Capítulo ${capAsignado}**.\n\n📁 **Drive:**\n${linkFormateado}`);
                
                await interaction.update({ embeds: [confirmacionPrivada], components: [] });
                pedidosTemp.delete(userId);
            }

            if (interaction.customId.startsWith('aprobar_') || interaction.customId.startsWith('rechazar_')) {
                if (!esAdmin(interaction)) return interaction.reply({ content: '❌ Solo admins.', flags: MessageFlags.Ephemeral });
                
                const datosDelBoton = interaction.customId.split('_');
                const accion = datosDelBoton[0]; const targetUserId = datosDelBoton[1]; const rol = datosDelBoton[2]; const cantidad = parseInt(datosDelBoton[3]);
                const embedOriginal = interaction.message.embeds[0];
                const nombreProyecto = embedOriginal.fields.find(f => f.name === '📚 Proyecto')?.value;

                const db = leerBaseDeDatos();

                if (accion === 'aprobar') {
                    if (!db[targetUserId]) db[targetUserId] = { clean: 0, tradu: 0, type: 0 };
                    db[targetUserId][rol] += cantidad; 
                    
                    if (nombreProyecto && db.proyectos[nombreProyecto]) {
                        if (db.proyectos[nombreProyecto].stats[rol].revisar >= cantidad) db.proyectos[nombreProyecto].stats[rol].revisar -= cantidad;
                        else db.proyectos[nombreProyecto].stats[rol].revisar = 0;
                        
                        db.proyectos[nombreProyecto].stats[rol].aprobados += cantidad;

                        if (rol === 'clean' || rol === 'tradu') {
                            if (db.proyectos[nombreProyecto].stats.type.bloqueados >= cantidad) {
                                db.proyectos[nombreProyecto].stats.type.bloqueados -= cantidad;
                                db.proyectos[nombreProyecto].stats.type.libres += cantidad;
                            }
                        }
                    }
                    guardarBaseDeDatos(db);
                    const aprobadoEmbed = EmbedBuilder.from(embedOriginal).setColor('#2ecc71').setTitle('✅ Trabajo Aprobado');
                    await interaction.update({ embeds: [aprobadoEmbed], components: [] });
                }

                if (accion === 'rechazar') {
                    if (nombreProyecto && db.proyectos[nombreProyecto]) {
                        if (db.proyectos[nombreProyecto].stats[rol].revisar >= cantidad) db.proyectos[nombreProyecto].stats[rol].revisar -= cantidad;
                        else db.proyectos[nombreProyecto].stats[rol].revisar = 0;
                        
                        db.proyectos[nombreProyecto].stats[rol].proceso += cantidad;
                        guardarBaseDeDatos(db);
                    }
                    const rechazadoEmbed = EmbedBuilder.from(embedOriginal).setColor('#e74c3c').setTitle('❌ Trabajo Rechazado');
                    await interaction.update({ embeds: [rechazadoEmbed], components: [] });
                }
            }
        }
    } catch (error) {
        console.error('⚠️ Error en interacción:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);