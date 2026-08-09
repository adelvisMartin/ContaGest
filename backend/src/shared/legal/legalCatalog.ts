import crypto from 'node:crypto';

export const LEGAL_EFFECTIVE_DATE='2026-08-09';
export const LEGAL_DOCUMENT_VERSION='2026-08-09.v1';

const provider={
  name:process.env.LEGAL_PROVIDER_NAME||'[RAZÓN SOCIAL DEL PROVEEDOR PENDIENTE]',
  rif:process.env.LEGAL_PROVIDER_RIF||'[RIF DEL PROVEEDOR PENDIENTE]',
  address:process.env.LEGAL_PROVIDER_ADDRESS||'[DOMICILIO DEL PROVEEDOR PENDIENTE]',
  legalEmail:process.env.LEGAL_CONTACT_EMAIL||'[EMAIL LEGAL/PRIVACIDAD PENDIENTE]',
  supportEmail:process.env.LEGAL_SUPPORT_EMAIL||'[EMAIL DE SOPORTE PENDIENTE]'
};

const interpolate=(value:string)=>value
  .replaceAll('{{PROVIDER_NAME}}',provider.name)
  .replaceAll('{{PROVIDER_RIF}}',provider.rif)
  .replaceAll('{{PROVIDER_ADDRESS}}',provider.address)
  .replaceAll('{{LEGAL_EMAIL}}',provider.legalEmail)
  .replaceAll('{{SUPPORT_EMAIL}}',provider.supportEmail);

const canonical=(value:string)=>value.replace(/\r\n/g,'\n').trim();
const hash=(value:string)=>crypto.createHash('sha256').update(canonical(value),'utf8').digest('hex');

const sourceDocuments=[
  {
    code:'terms',title:'Términos y Condiciones del Servicio',required:true,
    body:`1. PARTES Y ACEPTACIÓN. Estos Términos regulan el acceso a ContaGest-VE, prestado por {{PROVIDER_NAME}}, RIF {{PROVIDER_RIF}}, con domicilio {{PROVIDER_ADDRESS}}. El usuario declara que los datos suministrados son veraces y que cuenta con autorización suficiente para utilizar el servicio en nombre de la empresa a la que fue incorporado cuando corresponda. La aceptación electrónica se registra con versión, fecha, usuario, tenant y evidencia técnica.

2. OBJETO. ContaGest-VE es una plataforma de gestión empresarial modular que puede incluir contabilidad, ventas, compras, inventario, bancos, reportes y módulos opcionales. Los módulos de salud, veterinaria, fitness, comunicaciones e inteligencia artificial son opcionales y se habilitan únicamente si el plan o contrato los contempla.

3. EMPRESA, RIF Y MULTIEMPRESA. Cada tenant representa una empresa identificada por un RIF. El RIF queda bloqueado después del registro y no es un campo de edición ordinaria. Una corrección exige solicitud del representante autorizado, evidencia documental suficiente y revisión de plataforma; puede requerir migración controlada. Una persona solo podrá cambiar entre empresas para las que tenga una membresía válida y que estén cubiertas por la suscripción correspondiente. Intentar reutilizar una licencia, alterar identificadores, manipular el RIF o eludir límites de empresas, usuarios, módulos o dispositivos constituye incumplimiento material.

4. CUENTA, CREDENCIALES Y DISPOSITIVOS. Las credenciales son personales. El cliente debe proteger contraseñas, MFA, sesiones y dispositivos. Las licencias técnicas y credenciales de dispositivo no podrán venderse, compartirse ni copiarse fuera del alcance contratado. ContaGest puede revocar una sesión o dispositivo comprometido sin cancelar necesariamente toda la suscripción.

5. PLANES, MÓDULOS Y LÍMITES. El contrato comercial determina precio, moneda, ciclo, empresas incluidas, usuarios, dispositivos, soporte, módulos y add-ons. WhatsApp, SMS, correo, IA y otros terceros pueden tener condiciones, disponibilidad y costos independientes. Ninguna interfaz del navegador amplía derechos comerciales si el backend no reconoce el entitlement.

6. PAGOS. El cliente pagará los importes y tributos que correspondan según la orden, factura o acuerdo comercial. Al vencimiento el servicio podrá pasar a past_due durante el período de gracia configurado. Finalizada la gracia, puede suspenderse de acuerdo con la Política de Suspensión y Terminación aceptada junto con estos Términos.

7. DATOS DEL CLIENTE. El cliente conserva sus derechos sobre los datos que incorpora. El cliente es responsable de la legitimidad, exactitud, permisos de acceso y obligaciones legales de conservación de sus registros. ContaGest procesará los datos para prestar, proteger, mantener y soportar el servicio conforme al Aviso de Privacidad y al contrato aplicable.

8. REGISTROS CONTABLES, FISCALES Y CLÍNICOS. ContaGest es una herramienta de apoyo y no sustituye el criterio del contador, asesor tributario, profesional de salud u otro profesional responsable. El cliente debe verificar declaraciones, cierres, reportes y decisiones profesionales. El módulo de salud no diagnostica ni prescribe y su uso con datos reales exige que el cliente determine y cumpla sus deberes profesionales, de confidencialidad, conservación y autorización.

9. SEGURIDAD. El proveedor aplicará controles razonables de autenticación, autorización, aislamiento de tenant, registro de auditoría, sesiones y respaldo según el entorno contratado, sin prometer invulnerabilidad ni disponibilidad absoluta. El cliente deberá informar incidentes o sospechas a {{SUPPORT_EMAIL}} tan pronto sea razonablemente posible.

10. DISPONIBILIDAD Y TERCEROS. Mantenimiento, fallas de Internet, proveedores cloud, bancos, APIs públicas, servicios gubernamentales y canales externos pueden afectar funciones. Una integración solo se considera ofrecida cuando aparezca como habilitada y soportada en el contrato o producto vigente.

11. USO ACEPTABLE. Está prohibido atacar, escanear sin autorización, introducir malware, acceder a otro tenant, eludir licencias, falsear identidad o RIF, automatizar cargas abusivas, usar el servicio para actividad ilícita o infringir derechos de terceros. Se aplica además la Política de Uso Aceptable vigente.

12. SUSPENSIÓN Y TERMINACIÓN. Se aplicará el principio de mínima suspensión: dispositivo, usuario, tenant o suscripción según el riesgo. Las amenazas activas, fraude deliberado, acceso no autorizado a otro tenant, malware, elusión intencional de controles o una orden válida de autoridad pueden provocar suspensión inmediata. Los incumplimientos subsanables tendrán aviso y oportunidad razonable de corrección según la Política de Suspensión y Terminación. La terminación no implica borrado instantáneo; existirán ventanas de exportación/retención cuando sean técnica y legalmente procedentes.

13. CANCELACIÓN. El cliente podrá solicitar la no renovación conforme al ciclo contratado. El proveedor podrá terminar sin causa material con aviso previo razonable y tratamiento proporcional del período prepagado no consumido, salvo que un contrato empresarial disponga algo más favorable. Las obligaciones que por su naturaleza deban sobrevivir continuarán vigentes.

14. PROPIEDAD INTELECTUAL. ContaGest, su código, marca, interfaces y documentación pertenecen a sus titulares. La suscripción concede un derecho limitado de uso durante su vigencia, no una transferencia de propiedad.

15. RESPONSABILIDAD. Ninguna cláusula pretende excluir derechos inderogables. Salvo dolo, culpa grave o límites que la ley no permita restringir, las partes procurarán que las responsabilidades sean proporcionales al servicio contratado y al daño razonablemente previsible. Las cifras, impuestos y reportes deben ser revisados por el profesional responsable antes de decisiones o presentaciones oficiales.

16. CAMBIOS. Los cambios materiales en precio, alcance contractual, privacidad o suspensión se notificarán con antelación razonable y, cuando corresponda, exigirán nueva aceptación. El historial de versiones permanecerá identificable.

17. CONTACTO. Soporte: {{SUPPORT_EMAIL}}. Privacidad/legal: {{LEGAL_EMAIL}}. La ley aplicable, domicilio contractual definitivo y mecanismo de solución de controversias deberán completarse en el contrato comercial y validarse jurídicamente antes de operar con clientes reales.`
  },
  {
    code:'privacy',title:'Aviso de Privacidad y Tratamiento de Datos',required:true,
    body:`1. RESPONSABLE/ENCARGADO. {{PROVIDER_NAME}} opera la plataforma ContaGest-VE. Dependiendo del dato y del contrato, el proveedor puede tratar información para administrar cuentas y seguridad, y actuar como procesador técnico de información empresarial que el cliente controla. En módulos de salud, el establecimiento o profesional cliente conserva la responsabilidad sobre la legitimidad del registro clínico y las autorizaciones que le correspondan.

2. DATOS TRATADOS. Podemos tratar datos de cuenta (nombre, correo y rol), empresa (RIF, razón social y configuración), autenticación y seguridad (sesiones, IP, user-agent, identificadores/credenciales de dispositivo hasheadas), operaciones empresariales, pagos y soporte. Solo si el cliente habilita el módulo correspondiente podrán existir datos clínicos, de pacientes, propietarios de mascotas, fitness o comunicaciones.

3. FINALIDADES. Prestación del servicio; autenticación; aislamiento de empresas; licenciamiento; facturación; prevención de fraude y abuso; soporte; auditoría; respaldo; continuidad; cumplimiento de obligaciones aplicables; y analítica de producto cuando esté habilitada de forma opcional. No se autoriza reutilizar datos clínicos o empresariales del cliente para publicidad conductual.

4. MINIMIZACIÓN Y ACCESO. Los permisos deben asignarse por necesidad. El cliente debe evitar cargar información que no necesite para su finalidad empresarial. El proveedor limita el acceso operativo a personal o sistemas que lo requieran para soporte, seguridad u obligaciones válidas.

5. PROVEEDORES. Hosting, almacenamiento de respaldo, correo, WhatsApp, SMS, IA u otros subprocesadores solo se utilizarán cuando estén configurados. Su activación puede implicar transferencias o procesamiento por terceros y deberá reflejarse en el inventario de proveedores vigente.

6. CONSERVACIÓN. Los datos activos se conservan mientras el servicio y finalidad permanezcan vigentes. Los registros de aceptación y auditoría pueden conservarse por períodos superiores para demostrar seguridad, contrato o cumplimiento. Tras la terminación se aplicará la ventana de exportación/retención definida en la Política de Suspensión y Terminación, salvo obligación legal, disputa, investigación, respaldo aún no vencido o instrucción contractual distinta. El cliente es responsable de conservar las copias que exijan sus obligaciones contables, fiscales, profesionales o clínicas.

7. DERECHOS Y SOLICITUDES. La persona puede solicitar información sobre los datos vinculados a ella y, cuando proceda, acceso, corrección o tratamiento de información inexacta o ilegítima. Las solicitudes deberán enviarse a {{LEGAL_EMAIL}} y podrán exigir verificación de identidad y autoridad para proteger a otros usuarios y empresas.

8. SEGURIDAD E INCIDENTES. Se emplean controles técnicos y organizativos proporcionales al servicio, incluyendo autenticación, permisos, aislamiento de tenant, registros y mecanismos de sesión. Ningún sistema es absolutamente inmune. Los incidentes confirmados se gestionarán conforme al plan de respuesta y obligaciones aplicables.

9. DATOS DE SALUD. Antes de utilizar datos reales de salud humana debe completarse una evaluación específica de privacidad, roles, conservación, confidencialidad, proveedores, respaldo y respuesta a incidentes. El hecho de que el módulo exista técnicamente no autoriza por sí solo producción clínica.

10. CAMBIOS. Los cambios materiales se versionan. Si cambian de forma significativa las finalidades o condiciones esenciales, el sistema puede solicitar nueva aceptación antes de continuar.`
  },
  {
    code:'cookies',title:'Política de Cookies y Almacenamiento Local',required:true,
    body:`ContaGest usa cookies estrictamente necesarias para autenticación, protección CSRF y control técnico de dispositivos. En producción los nombres pueden usar el prefijo __Host-.

- cg_access / __Host-cg_access: cookie HttpOnly de acceso; necesaria; vida corta aproximada de 15 minutos; Secure en producción; SameSite=Lax.
- cg_refresh / __Host-cg_refresh: cookie HttpOnly de renovación; necesaria; duración máxima aproximada de 30 días, sujeta a revocación/rotación; Secure en producción; SameSite=Lax.
- cg_csrf / __Host-cg_csrf: cookie necesaria de protección frente a solicitudes cruzadas; no contiene el JWT; duración ligada a la sesión; Secure en producción; SameSite=Lax.
- cg_device / __Host-cg_device: credencial HttpOnly de dispositivo emitida por servidor para reducir clonación de licencia; necesaria cuando aplica licenciamiento por dispositivo; SameSite=Strict; expira por licencia o por el límite técnico configurado.

Estas cookies necesarias no se usan para publicidad y son indispensables para las funciones protegidas de la aplicación. Si se bloquean, el usuario puede no poder iniciar o mantener una sesión segura.

ContaGest también utiliza almacenamiento local o de sesión para preferencias no secretas, estado PWA y telemetría local. El JWT de producción no debe guardarse en localStorage.

La analítica enviada al backend es opcional y debe permanecer deshabilitada hasta que el usuario la habilite. El consentimiento opcional puede retirarse posteriormente sin desactivar las cookies estrictamente necesarias. No se habilitarán cookies de marketing por defecto. Si en el futuro se añade un proveedor de analítica o marketing que escriba cookies no necesarias, deberá incorporarse al catálogo, documentarse y quedar bloqueado hasta consentimiento previo.`
  },
  {
    code:'acceptable-use',title:'Política de Uso Aceptable',required:true,
    body:`El usuario se compromete a utilizar ContaGest únicamente dentro del alcance autorizado. Queda prohibido: (a) intentar acceder a datos, tenants, cuentas o dispositivos ajenos; (b) explotar vulnerabilidades o ejecutar pruebas de seguridad sin autorización escrita del propietario del entorno; (c) eludir límites de licencia, RIF, usuarios, dispositivos, módulos o suscripción; (d) compartir credenciales personales o credenciales de dispositivo; (e) introducir malware, ransomware, scripts destructivos o cargas destinadas a degradar el servicio; (f) falsear identidad, representación, RIF, pagos o documentos; (g) usar canales de comunicación para spam, fraude o contenido ilícito; (h) cargar datos respecto de los cuales el cliente no tenga una base legítima de tratamiento; (i) usar el servicio para infringir derechos de terceros; y (j) interferir con auditoría, controles de seguridad o investigación de incidentes.

Las pruebas de seguridad legítimas sobre una instancia del propio cliente deben realizarse con alcance, horario y autorización documentados para no afectar a otros tenants. El proveedor podrá aplicar rate limiting, revocar sesiones/dispositivos, preservar evidencia y suspender el mínimo alcance necesario ante riesgo real.

Los errores de uso de buena fe deben tratarse de forma distinta del fraude o la evasión deliberada. La reiteración después de una advertencia documentada puede elevar la severidad contractual.`
  },
  {
    code:'suspension-termination',title:'Política de Suspensión, Reactivación y Terminación',required:true,
    body:`1. PRINCIPIO DE PROPORCIONALIDAD. Se suspende el alcance mínimo necesario: primero dispositivo, luego usuario, tenant/RIF y finalmente suscripción/cuenta, salvo que el riesgo abarque todo el servicio.

2. SUSPENSIÓN INMEDIATA DE SEGURIDAD. Puede aplicarse sin período previo de subsanación ante ataque activo, credenciales comprometidas con riesgo real, malware, ransomware, intento de acceso a otro tenant, fraude deliberado, elusión intencional de licencia/RIF/dispositivos, falsificación grave, actividad ilícita manifiesta o una orden válida de autoridad competente. Deben registrarse motivo, evidencia, alcance, actor y hora. Cuando notificar antes aumente el riesgo, la notificación puede realizarse después de contener el incidente.

3. INCUMPLIMIENTO SUBSANABLE. Para uso indebido no urgente, exceso contractual, compartición no maliciosa, incumplimiento de políticas o información pendiente, se enviará aviso identificando el problema y, como regla operativa, se concederán 5 días hábiles para subsanar. Si no se corrige, podrá suspenderse el alcance afectado. Una repetición sustancial del mismo incumplimiento dentro de 90 días puede justificar suspensión más rápida.

4. IMPAGO. En la fecha de vencimiento la suscripción puede pasar a past_due. Durante la gracia configurada el servicio continuará conforme al contrato y se emitirán avisos. Vencida la gracia sin pago confirmado, la suscripción puede pasar a suspended. Como política comercial por defecto, si el contrato no establece otra cosa: recordatorio en D0, seguimiento durante D+1 a D+5 y suspensión desde D+6. Si continúa impaga 30 días después de la suspensión, queda elegible para terminación, con aviso final al menos 7 días calendario antes de ejecutarla.

5. REACTIVACIÓN. Una cuenta suspendida por impago podrá reactivarse cuando el pago sea confirmado y no exista otro bloqueo. Una suspensión por seguridad exige confirmar que la causa fue contenida: cambio de credenciales, revocación de dispositivo, corrección de configuración u otra medida aplicable. Reactivar no borra el historial de auditoría.

6. TERMINACIÓN POR CAUSA. Puede terminarse por fraude o ataque deliberado grave, incumplimiento material reiterado, falta de pago que supere la ventana anterior, uso ilícito confirmado, falsedad material no corregida, imposibilidad legal de continuar o incumplimiento esencial no subsanado. La decisión debe ser trazable y aprobarse por un responsable distinto de quien generó el hallazgo cuando sea razonablemente posible.

7. CANCELACIÓN SIN CAUSA. El cliente puede solicitar no renovación para el final del ciclo contratado. Si el proveedor decide finalizar por conveniencia y no por incumplimiento, deberá procurar aviso previo de 30 días y resolver proporcionalmente el período prepagado no consumido, salvo acuerdo empresarial más favorable.

8. EXPORTACIÓN Y RETENCIÓN. La suspensión no equivale a borrado. Tras terminación, y salvo obligación legal, investigación, disputa o contrato distinto, se procurará una ventana operativa de 90 días para solicitar exportación o recuperación administrativa. El acceso interactivo normal puede permanecer deshabilitado. Al vencer la ventana los datos operativos podrán entrar en proceso de eliminación; copias de respaldo desaparecerán según su ciclo técnico. Datos sujetos a obligaciones contables, fiscales, clínicas o legales no deben eliminarse automáticamente sin revisión del caso.

9. RECLAMACIÓN. El cliente podrá pedir revisión aportando evidencia dentro de los 5 días hábiles siguientes a la notificación. Una suspensión preventiva de seguridad puede mantenerse mientras se revisa si levantarla recrearía el riesgo.

10. PROHIBICIÓN DE REPRESALIAS ARBITRARIAS. No se suspenderá por una queja legítima, solicitud de acceso a datos o desacuerdo comercial de buena fe. Toda suspensión manual debe indicar una categoría definida de motivo y quedar auditada.`
  }
] as const;

export function legalProvider(){return {...provider};}
export function legalProductionReady(){return Object.values(provider).every((value)=>!String(value).startsWith('['));}
export function currentLegalDocuments(){
  return sourceDocuments.map((doc)=>{
    const body=canonical(interpolate(doc.body));
    return {...doc,version:LEGAL_DOCUMENT_VERSION,effectiveAt:LEGAL_EFFECTIVE_DATE,body,hash:hash(body)};
  });
}
export const REQUIRED_LEGAL_CODES=sourceDocuments.filter((doc)=>doc.required).map((doc)=>doc.code);
