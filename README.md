# Simulador CRA · CIFP Tony Gallardo

Simulador de Central Receptora de Alarmas para el CFGM Técnico en Seguridad (RD 570/2023), módulo 1679 Vigilancia y protección, RA4.

- 15 puestos de Teleoperador y perfil Docente (contraseña en la variable `DOCENTE_PIN`).
- Señales de centralita (verificación secuencial, vídeo, audio, llamada al titular, vigilante de acuda) y llamadas de alertantes por chat con preguntas programadas y mensaje libre.
- Temporizador de 120 s con barra verde → rojo; la comunicación sigue abierta al superarlo.
- Nota sobre 10: 30 % tiempo + 70 % procedimiento (rúbrica en `data/rubrica.json`, CE a–f del RA4). El tiempo se pondera por la calidad del procedimiento.
- Informe PDF del alumno, informes individuales y conjunto del docente.
- Docente: Inicio/Fin de actividad, TEST/FIN TEST (bots en los puestos libres), supuestos programados, observación de puestos y mensajería.

## Variables de entorno (Render)

| Variable | Uso |
|---|---|
| `DOCENTE_PIN` | Contraseña del docente |
| `GITHUB_TOKEN` | Token con permiso de escritura en el repositorio (persistencia en la rama `datos`) |
| `GITHUB_REPO` | `etadrod/cra-seguridad-tonygallardo` |
| `LIMITE_HORAS_DIA` | Horas de uso diario (0 = sin límite) |

Sin `GITHUB_TOKEN` los resultados se guardan en disco local y se pierden si Render reinicia: descarga los informes al terminar.

## Datos editables

`data/abonados.json`, `data/supuestos.json`, `data/preguntas.json`, `data/rubrica.json`, `data/config.json`. Las marcas [EDITABLE] (empresa, grado, cuerpo competente, códigos de evento tipo Contact ID) y las referencias normativas están pendientes de verificación por el docente.

## Pruebas

`npm test`
