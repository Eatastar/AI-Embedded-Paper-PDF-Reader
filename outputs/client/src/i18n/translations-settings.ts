export const settings = String.raw`
删除这份备份|Eliminar esta copia|このバックアップを削除|Dieses Backup löschen|حذف هذه النسخة|Supprimer cette sauvegarde
删除 {0} 的备份|Eliminar la copia de {0}|{0} のバックアップを削除|Backup vom {0} löschen|حذف نسخة {0}|Supprimer la sauvegarde du {0}
删除这份备份？|¿Eliminar esta copia?|このバックアップを削除しますか？|Dieses Backup löschen?|هل تريد حذف هذه النسخة؟|Supprimer cette sauvegarde ?
只删除这个恢复点，不影响当前的聊天、笔记、批注和 PDF。之后仍会按规则生成新备份。|Solo se elimina este punto de restauración. Los chats, notas, anotaciones y PDF actuales se conservan. Se seguirán creando nuevas copias según lo previsto.|この復元ポイントだけを削除します。現在のチャット、メモ、注釈、PDF は変更されません。新しいバックアップは引き続き作成されます。|Nur dieser Wiederherstellungspunkt wird gelöscht. Aktuelle Chats, Notizen, Anmerkungen und PDFs bleiben erhalten. Neue Backups werden weiterhin planmäßig erstellt.|تُحذف نقطة الاستعادة هذه فقط. تبقى المحادثات والملاحظات والتعليقات وملفات PDF الحالية كما هي. سيستمر إنشاء نسخ جديدة وفق الجدول.|Seul ce point de restauration est supprimé. Les conversations, notes, annotations et PDF actuels sont conservés. De nouvelles sauvegardes seront toujours créées selon le calendrier.
这是升级前备份，删除后将无法通过它恢复到升级前。|Esta copia se creó antes de una actualización. Al eliminarla, no podrás usarla para recuperar ese estado anterior.|これは更新前のバックアップです。削除すると、このバックアップから更新前の状態には戻せません。|Dieses Backup stammt aus der Zeit vor einem Upgrade. Nach dem Löschen lässt sich dieser frühere Zustand damit nicht mehr wiederherstellen.|أُنشئت هذه النسخة قبل الترقية. بعد حذفها، لن تتمكن من استخدامها لاستعادة تلك الحالة السابقة.|Cette sauvegarde précède une mise à jour. Une fois supprimée, elle ne permettra plus de retrouver cet état antérieur.
备份已删除。|Copia eliminada.|バックアップを削除しました。|Backup gelöscht.|تم حذف النسخة.|Sauvegarde supprimée.
备份已删除，部分附件暂时无法清理，将稍后重试。|Copia eliminada. No se pudieron limpiar algunos archivos sin uso; se volverá a intentar más tarde.|バックアップを削除しました。一部の未使用添付ファイルはまだ削除できないため、後でもう一度試します。|Backup gelöscht. Einige ungenutzte Anhänge konnten noch nicht bereinigt werden; die Bereinigung wird später erneut versucht.|حُذفت النسخة. تعذر تنظيف بعض المرفقات غير المستخدمة حاليًا؛ ستُعاد المحاولة لاحقًا.|Sauvegarde supprimée. Certains fichiers inutilisés n’ont pas pu être nettoyés ; une nouvelle tentative aura lieu plus tard.
聊天和批注照常自动保存；有变化时每 10 分钟建立备份，退出前也会备份。保留最近 5 份普通备份和 2 份升级前备份，可逐条删除。|Los chats y las anotaciones se guardan automáticamente. Si hay cambios, se crea una copia cada 10 minutos y antes de salir. Se conservan cinco copias normales y dos previas a actualizaciones, que puedes eliminar por separado.|チャットと注釈は通常どおり自動保存されます。変更があれば 10 分ごとと終了前にバックアップします。通常の 5 件と更新前の 2 件を保持し、個別に削除できます。|Chats und Anmerkungen werden weiterhin automatisch gespeichert. Änderungen werden alle 10 Minuten und vor dem Beenden gesichert. Fünf normale und zwei Backups vor Upgrades bleiben erhalten und können einzeln gelöscht werden.|تستمر المحادثات والتعليقات في الحفظ التلقائي. تُنسخ التغييرات كل 10 دقائق وقبل الخروج. تُحفظ خمس نسخ عادية ونسختان قبل الترقية، ويمكن حذف كل منها على حدة.|Les conversations et annotations continuent d’être enregistrées automatiquement. Les changements sont sauvegardés toutes les 10 minutes et avant de quitter. Cinq sauvegardes normales et deux précédant une mise à jour sont conservées et peuvent être supprimées individuellement.
备份删除状态无法确认，旧备份未清理。请先导出备份后重试。|No se pudo verificar el estado de eliminación. No se limpiaron las copias existentes. Exporta una copia antes de volver a intentarlo.|バックアップの削除状態を確認できません。既存のバックアップは削除していません。先にバックアップを書き出してから再試行してください。|Der Löschstatus konnte nicht geprüft werden. Bestehende Backups wurden nicht bereinigt. Exportieren Sie vor einem erneuten Versuch ein Backup.|تعذر التحقق من حالة حذف النسخة. لم تُنظف النسخ الموجودة. صدّر نسخة قبل إعادة المحاولة.|L’état de suppression n’a pas pu être vérifié. Les sauvegardes existantes n’ont pas été nettoyées. Exportez une sauvegarde avant de réessayer.
自动备份中的相同附件只保存一份，各恢复点共享使用。导出 JSON 时会附带原文件，可单独恢复。|Las copias automáticas guardan una sola copia de los archivos idénticos y la comparten entre puntos de restauración. El JSON exportado incluye los originales y se restaura por sí solo.|自動バックアップは同じ添付ファイルを一度だけ保存し、各復元ポイントで共有します。書き出した JSON には元ファイルが含まれ、単独で復元できます。|Automatische Backups speichern identische Anhänge nur einmal und teilen sie zwischen Wiederherstellungspunkten. Exportierte JSON-Dateien enthalten die Originale und lassen sich einzeln wiederherstellen.|تحفظ النسخ التلقائية نسخة واحدة من المرفقات المتطابقة وتشترك فيها نقاط الاستعادة. يتضمن JSON المصدّر الملفات الأصلية ويمكن استعادته بمفرده.|Les sauvegardes automatiques ne stockent les pièces jointes identiques qu’une fois et les partagent entre points de restauration. Le JSON exporté contient les originaux et se restaure seul.
共享附件备份|Copia con archivos compartidos|添付ファイル共有バックアップ|Backup mit gemeinsamen Anhängen|نسخة بمرفقات مشتركة|Sauvegarde avec fichiers partagés
记录 {0} MB|Registros {0} MB|記録 {0} MB|Einträge {0} MB|السجلات {0} MB|Données {0} MB
备份附件标识无效。|El identificador del archivo no es válido.|バックアップ添付ファイルの識別子が無効です。|Ungültige Kennung des Backup-Anhangs.|معرّف المرفق في النسخة غير صالح.|Identifiant de pièce jointe invalide.
备份附件缺失或损坏，请选择其他备份。|Falta un archivo o está dañado. Elige otra copia.|添付ファイルが見つからないか破損しています。別のバックアップを選んでください。|Ein Backup-Anhang fehlt oder ist beschädigt. Wählen Sie ein anderes Backup.|أحد المرفقات مفقود أو تالف. اختر نسخة أخرى.|Une pièce jointe manque ou est endommagée. Choisissez une autre sauvegarde.
备份附件大小不匹配。|El tamaño del archivo no coincide.|添付ファイルのサイズが一致しません。|Die Größe des Backup-Anhangs stimmt nicht überein.|حجم المرفق لا يطابق السجل.|La taille de la pièce jointe ne correspond pas.
备份附件完整性校验未通过，请选择其他备份。|Falló la verificación del archivo. Elige otra copia.|添付ファイルの整合性を確認できません。別のバックアップを選んでください。|Integritätsprüfung des Anhangs fehlgeschlagen. Wählen Sie ein anderes Backup.|فشل التحقق من سلامة المرفق. اختر نسخة أخرى.|La vérification de la pièce jointe a échoué. Choisissez une autre sauvegarde.
备份附件写入校验未通过。|Falló la verificación del archivo guardado.|保存した添付ファイルの検証に失敗しました。|Prüfung des geschriebenen Backup-Anhangs fehlgeschlagen.|فشل التحقق من المرفق بعد كتابته.|La vérification du fichier écrit a échoué.
备份附件类型无效。|El tipo de archivo no es válido.|添付ファイルの種類が無効です。|Ungültiger Dateityp des Backup-Anhangs.|نوع ملف المرفق غير صالح.|Type de pièce jointe invalide.
备份附件无效。|Los archivos de la copia no son válidos.|バックアップの添付ファイルが無効です。|Ungültige Backup-Anhänge.|مرفقات النسخة غير صالحة.|Pièces jointes de sauvegarde invalides.
备份附件不完整。|Faltan archivos en la copia.|バックアップの添付ファイルが不足しています。|Backup-Anhänge sind unvollständig.|مرفقات النسخة غير مكتملة.|Les pièces jointes sont incomplètes.
备份任务已经关闭，请重试。|La tarea de copia se cerró. Inténtalo de nuevo.|バックアップ処理は終了しています。もう一度お試しください。|Die Backup-Aufgabe wurde beendet. Versuchen Sie es erneut.|أُغلقت مهمة النسخ. حاول مجددًا.|La tâche de sauvegarde est fermée. Réessayez.
另一份备份正在写入，请稍后重试。|Se está guardando otra copia. Inténtalo más tarde.|別のバックアップを書き込み中です。後でもう一度お試しください。|Ein anderes Backup wird geschrieben. Versuchen Sie es später erneut.|تجري كتابة نسخة أخرى. حاول بعد قليل.|Une autre sauvegarde est en cours. Réessayez plus tard.
备份分块无效。|El bloque de copia no es válido.|バックアップのデータブロックが無効です。|Ungültiger Backup-Datenblock.|جزء النسخة غير صالح.|Bloc de sauvegarde invalide.
备份附件不完整，旧备份已保留。|Faltan archivos. Se conservaron las copias anteriores.|添付ファイルが不足しています。以前のバックアップは保持されています。|Anhänge sind unvollständig. Bisherige Backups bleiben erhalten.|المرفقات غير مكتملة. احتُفظ بالنسخ السابقة.|Les pièces jointes sont incomplètes. Les anciennes sauvegardes sont conservées.
备份超过 350 MB。|La copia supera los 350 MB.|バックアップが 350 MB を超えています。|Das Backup überschreitet 350 MB.|يتجاوز حجم النسخة 350 MB.|La sauvegarde dépasse 350 MB.
旧备份格式暂不支持自动转换。|Este formato antiguo no admite conversión automática.|この旧形式は自動変換に対応していません。|Dieses ältere Backup-Format kann nicht automatisch konvertiert werden.|لا يمكن تحويل تنسيق النسخة القديمة تلقائيًا.|Cet ancien format ne peut pas être converti automatiquement.
另一份备份仍在写入，请稍后重试。|Otra copia sigue guardándose. Inténtalo más tarde.|別のバックアップを引き続き書き込み中です。後でもう一度お試しください。|Ein anderes Backup wird noch geschrieben. Versuchen Sie es später erneut.|ما زالت كتابة نسخة أخرى جارية. حاول بعد قليل.|Une autre sauvegarde est toujours en cours. Réessayez plus tard.
我的模型|Mis modelos|マイモデル|Meine Modelle|نماذجي|Mes modèles
已保存的连接|Conexiones guardadas|保存済みの接続|Gespeicherte Verbindungen|الاتصالات المحفوظة|Connexions enregistrées
选择已保存的连接（|Elegir conexión guardada (|保存済み接続を選択（|Gespeicherte Verbindung wählen (|اختيار اتصال محفوظ (|Choisir une connexion enregistrée (
 ✓ 使用中| ✓ En uso| ✓ 使用中| ✓ Aktiv| ✓ قيد الاستخدام| ✓ Utilisée
使用中|En uso|使用中|Aktiv|قيد الاستخدام|Utilisée
使用|Usar|使用|Verwenden|استخدام|Utiliser
编辑所选连接|Editar conexión|選択した接続を編集|Verbindung bearbeiten|تعديل الاتصال المحدد|Modifier la connexion
删除所选连接|Eliminar conexión|選択した接続を削除|Verbindung löschen|حذف الاتصال المحدد|Supprimer la connexion
密钥已加密保存|Clave guardada cifrada|キーを暗号化して保存済み|Schlüssel verschlüsselt gespeichert|المفتاح محفوظ مشفرًا|Clé enregistrée chiffrée
密钥仅本次有效|Clave solo en esta sesión|キーはこのセッションのみ|Schlüssel nur für diese Sitzung|المفتاح لهذه الجلسة فقط|Clé pour cette session uniquement
删除中…|Eliminando…|削除中…|Wird gelöscht…|جارٍ الحذف…|Suppression…
确认删除|Confirmar eliminación|削除を確認|Löschen bestätigen|تأكيد الحذف|Confirmer la suppression
使用本地演示|Usar demostración local|ローカルデモを使用|Lokale Demo verwenden|استخدام العرض المحلي|Utiliser la démo locale
不调用 API|Sin llamadas API|API 呼び出しなし|Keine API-Aufrufe|دون استدعاء API|Sans appel API
编辑连接|Editar conexión|接続を編集|Verbindung bearbeiten|تعديل الاتصال|Modifier la connexion
新建连接|Nueva conexión|新しい接続|Neue Verbindung|اتصال جديد|Nouvelle connexion
选择连接模板|Elegir plantilla|接続テンプレートを選択|Verbindungsvorlage wählen|اختيار قالب الاتصال|Choisir un modèle de connexion
常用服务|Servicios habituales|よく使うサービス|Häufige Dienste|الخدمات الشائعة|Services courants
连接名称|Nombre de conexión|接続名|Verbindungsname|اسم الاتصال|Nom de connexion
接口格式|Formato de API|API 形式|API-Format|تنسيق الواجهة|Format API
API 地址|Dirección API|API アドレス|API-Adresse|عنوان API|Adresse API
模型名称|Nombre del modelo|モデル名|Modellname|اسم النموذج|Nom du modèle
填写服务商提供的完整模型名称|Nombre exacto indicado por el proveedor|提供元の正確なモデル名を入力|Exakten Modellnamen des Anbieters eingeben|أدخل اسم النموذج الدقيق من مزود الخدمة|Saisissez le nom exact fourni par le service
API 密钥|Clave API|API キー|API-Schlüssel|مفتاح API|Clé API
将使用新密钥|Se usará la clave nueva|新しいキーを使用します|Neuer Schlüssel wird verwendet|سيُستخدم المفتاح الجديد|La nouvelle clé sera utilisée
已加密保存|Guardado cifrado|暗号化して保存済み|Verschlüsselt gespeichert|محفوظ مشفرًا|Enregistré chiffré
本次运行已设置|Configurado para esta sesión|このセッションに設定済み|Für diese Sitzung festgelegt|مُعدّ لهذه الجلسة|Défini pour cette session
未填写，可稍后补充|Vacío; puede añadirse después|未入力、後で追加可能|Leer; kann später ergänzt werden|غير محدد؛ يمكن إضافته لاحقًا|Vide ; peut être ajouté plus tard
留空保留此连接的密钥|Deja vacío para conservar la clave|空欄なら現在のキーを保持|Leer lassen, um Schlüssel zu behalten|اتركه فارغًا للاحتفاظ بالمفتاح|Laissez vide pour conserver la clé
密钥不会进入聊天记录或聊天备份。|La clave no se guarda en chats ni copias de chats.|キーはチャット履歴やバックアップに含まれません。|Schlüssel sind nicht in Chats oder Chatsicherungen enthalten.|لا تُضمّن المفاتيح في سجل المحادثة أو نسخها الاحتياطية.|Les clés sont exclues des conversations et de leurs sauvegardes.
回答偏好|Preferencias de respuesta|回答の設定|Antwortvorgaben|تفضيلات الإجابة|Préférences de réponse
保存和切换都不会发送问题|Guardar o cambiar no envía preguntas|保存・切替時には質問を送信しません|Speichern und Wechseln sendet keine Fragen|لا يُرسل سؤال عند الحفظ أو التبديل|Enregistrer ou changer n’envoie aucune question
保存并使用|Guardar y usar|保存して使用|Speichern und verwenden|حفظ واستخدام|Enregistrer et utiliser
中转站|API intermediaria|中継 API|Relay-API|واجهة وسيطة|API relais
GPT 官方|OpenAI oficial|OpenAI 公式|OpenAI offiziell|OpenAI الرسمية|OpenAI officiel
Claude 官方|Claude oficial|Claude 公式|Claude offiziell|Claude الرسمية|Claude officiel
其他|Otro|その他|Andere|أخرى|Autre
自定义 API|API personalizada|カスタム API|Eigene API|واجهة API مخصصة|API personnalisée
本地 · Ollama|Local · Ollama|ローカル · Ollama|Lokal · Ollama|محلي · Ollama|Local · Ollama
本地 · LM Studio|Local · LM Studio|ローカル · LM Studio|Lokal · LM Studio|محلي · LM Studio|Local · LM Studio
千问 · 阿里云百炼|Qwen · Alibaba Cloud|Qwen · Alibaba Cloud|Qwen · Alibaba Cloud|Qwen · Alibaba Cloud|Qwen · Alibaba Cloud
配置 API|Configurar API|API を設定|API einrichten|إعداد API|Configurer l’API
配置 API / 获取模型|Configurar API / obtener modelos|API 設定・モデル取得|API einrichten / Modelle abrufen|إعداد API / جلب النماذج|Configurer l’API / obtenir les modèles
AI / API 连接|Conexión IA / API|AI / API 接続|KI-/API-Verbindung|اتصال الذكاء الاصطناعي / API|Connexion IA / API
探测上游模型|Descubrir modelos del proveedor|提供元のモデルを取得|Anbietermodelle abrufen|استكشاف نماذج المزود|Découvrir les modèles du fournisseur
上游模型探照|Descubrimiento de modelos|モデルの検索|Modellsuche|استكشاف النماذج|Découverte des modèles
探测模型|Obtener modelos|モデルを取得|Modelle abrufen|جلب النماذج|Obtenir les modèles
获取上游模型列表|Obtener lista de modelos|提供元のモデル一覧を取得|Modellliste abrufen|جلب قائمة النماذج|Obtenir la liste des modèles
正在获取模型…|Obteniendo modelos…|モデルを取得中…|Modelle werden geladen…|جارٍ جلب النماذج…|Chargement des modèles…
筛选模型|Filtrar modelos|モデルを絞り込む|Modelle filtern|تصفية النماذج|Filtrer les modèles
输入名称筛选|Filtrar por nombre|名前で絞り込む|Nach Namen filtern|التصفية بالاسم|Filtrer par nom
上游模型（{0}）|Modelos disponibles ({0})|利用可能なモデル（{0}）|Verfügbare Modelle ({0})|النماذج المتاحة ({0})|Modèles disponibles ({0})
请选择模型|Elige un modelo|モデルを選択|Modell auswählen|اختر نموذجًا|Choisissez un modèle
请选择调用模型|Elige el modelo de la API|API で呼び出すモデルを選択|API-Modell auswählen|اختر نموذج الاستدعاء|Choisissez le modèle API
当前模型：{0}|Modelo actual: {0}|現在のモデル：{0}|Aktuelles Modell: {0}|النموذج الحالي: {0}|Modèle actuel : {0}
当前调用：{0}（未在列表中）|Modelo actual: {0} (no está en la lista)|現在のモデル：{0}（一覧にありません）|Aktuelles Modell: {0} (nicht aufgelistet)|النموذج الحالي: {0} (غير مدرج)|Modèle actuel : {0} (non répertorié)
收起手动输入|Ocultar entrada manual|手動入力を閉じる|Manuelle Eingabe schließen|طي الإدخال اليدوي|Masquer la saisie manuelle
手动填写模型名称|Introducir modelo manualmente|モデル名を手動入力|Modellnamen manuell eingeben|إدخال اسم النموذج يدويًا|Saisir le nom du modèle
调用模型（手动填写）|Modelo API (manual)|呼び出すモデル（手動入力）|API-Modell (manuell)|نموذج API (إدخال يدوي)|Modèle API (saisie manuelle)
填写服务商提供的准确模型 ID|Introduce el ID exacto del modelo|提供元の正確なモデル ID を入力|Exakte Modell-ID eingeben|أدخل معرّف النموذج الدقيق|Saisissez l’identifiant exact du modèle
模型名称是调用时发送给 API 的真实名称。|Es el nombre real enviado a la API.|API に送信される実際のモデル名です。|Dies ist der an die API gesendete Modellname.|هذا هو اسم النموذج الفعلي المرسل إلى API.|C’est le nom réel envoyé à l’API.
回收站|Papelera|ゴミ箱|Papierkorb|سلة المحذوفات|Corbeille
关闭回收站|Cerrar papelera|ゴミ箱を閉じる|Papierkorb schließen|إغلاق سلة المحذوفات|Fermer la corbeille
清空回收站？|¿Vaciar la papelera?|ゴミ箱を空にしますか？|Papierkorb leeren?|إفراغ سلة المحذوفات؟|Vider la corbeille ?
永久删除这条记录？|¿Eliminar este registro permanentemente?|この記録を完全に削除しますか？|Diesen Eintrag endgültig löschen?|حذف هذا السجل نهائيًا؟|Supprimer définitivement cette entrée ?
正在删除…|Eliminando…|削除中…|Wird gelöscht…|جارٍ الحذف…|Suppression…
确认清空|Confirmar vaciado|空にする|Leeren bestätigen|تأكيد الإفراغ|Confirmer le vidage
确认永久删除|Confirmar eliminación definitiva|完全に削除する|Endgültiges Löschen bestätigen|تأكيد الحذف النهائي|Confirmer la suppression définitive
回收站是空的。|La papelera está vacía.|ゴミ箱は空です。|Der Papierkorb ist leer.|سلة المحذوفات فارغة.|La corbeille est vide.
共 {0} 条记录|{0} registros|全 {0} 件|{0} Einträge|{0} سجلات|{0} entrées
清空回收站|Vaciar papelera|ゴミ箱を空にする|Papierkorb leeren|إفراغ سلة المحذوفات|Vider la corbeille
对话|Chat|チャット|Chat|محادثة|Conversation
永久删除|Eliminar definitivamente|完全に削除|Endgültig löschen|حذف نهائي|Supprimer définitivement
恢复|Restaurar|復元|Wiederherstellen|استعادة|Restaurer
恢复对话：{0}|Restaurar chat: {0}|チャットを復元：{0}|Chat wiederherstellen: {0}|استعادة المحادثة: {0}|Restaurer la conversation : {0}
永久删除对话：{0}|Eliminar chat definitivamente: {0}|チャットを完全に削除：{0}|Chat endgültig löschen: {0}|حذف المحادثة نهائيًا: {0}|Supprimer définitivement la conversation : {0}
恢复批注：{0}|Restaurar anotación: {0}|注釈を復元：{0}|Notiz wiederherstellen: {0}|استعادة التعليق: {0}|Restaurer l’annotation : {0}
永久删除批注：{0}|Eliminar anotación definitivamente: {0}|注釈を完全に削除：{0}|Notiz endgültig löschen: {0}|حذف التعليق نهائيًا: {0}|Supprimer définitivement l’annotation : {0}
关闭备份与恢复|Cerrar copias y restauración|バックアップと復元を閉じる|Sichern und Wiederherstellen schließen|إغلاق النسخ الاحتياطي والاستعادة|Fermer la sauvegarde et restauration
模型密钥不包含在备份中。|Las claves no se incluyen en las copias.|モデルのキーはバックアップに含まれません。|Modellschlüssel sind nicht in Sicherungen enthalten.|لا تتضمن النسخ الاحتياطية مفاتيح النماذج.|Les clés des modèles sont exclues des sauvegardes.
导出范围|Alcance de exportación|書き出し範囲|Exportumfang|نطاق التصدير|Périmètre d’exportation
备份导出范围|Alcance de la copia|バックアップの書き出し範囲|Sicherungsumfang|نطاق تصدير النسخة|Périmètre de la sauvegarde
全部记录（含回收站）|Todo (incluida la papelera)|すべての記録（ゴミ箱を含む）|Alle Einträge (mit Papierkorb)|كل السجلات (بما فيها المحذوفات)|Toutes les entrées (corbeille incluse)
当前对话|Chat actual|現在のチャット|Aktueller Chat|المحادثة الحالية|Conversation actuelle
立即备份|Crear copia ahora|今すぐバックアップ|Jetzt sichern|نسخ احتياطي الآن|Sauvegarder maintenant
兼容旧版导出|Exportar para versiones anteriores|旧バージョン用に書き出す|Für ältere Versionen exportieren|تصدير متوافق مع الإصدارات القديمة|Exporter pour les anciennes versions
从文件恢复|Restaurar desde archivo|ファイルから復元|Aus Datei wiederherstellen|استعادة من ملف|Restaurer depuis un fichier
正在读取本机备份…|Leyendo copias locales…|ローカルバックアップを読み込み中…|Lokale Sicherungen werden gelesen…|جارٍ قراءة النسخ المحلية…|Lecture des sauvegardes locales…
升级前备份|Copia previa a actualización|更新前のバックアップ|Sicherung vor Aktualisierung|نسخة ما قبل التحديث|Sauvegarde avant mise à jour
完整备份|Copia completa|完全バックアップ|Vollständige Sicherung|نسخة احتياطية كاملة|Sauvegarde complète
导出 {0} 的备份|Exportar copia de {0}|{0} のバックアップを書き出す|Sicherung von {0} exportieren|تصدير نسخة {0}|Exporter la sauvegarde de {0}
导出这份备份|Exportar esta copia|このバックアップを書き出す|Diese Sicherung exportieren|تصدير هذه النسخة|Exporter cette sauvegarde
恢复为新对话|Restaurar como chat nuevo|新しいチャットとして復元|Als neuen Chat wiederherstellen|استعادة كمحادثة جديدة|Restaurer dans une nouvelle conversation
选择恢复备份文件|Elegir copia para restaurar|復元するバックアップを選択|Sicherungsdatei auswählen|اختيار ملف النسخة للاستعادة|Choisir la sauvegarde à restaurer
从备份恢复|Restaurar copia|バックアップから復元|Aus Sicherung wiederherstellen|استعادة نسخة احتياطية|Restaurer une sauvegarde
重新打开|Volver a abrir|開き直す|Erneut öffnen|إعادة الفتح|Rouvrir
构建 {0} · {1}|Compilación {0} · {1}|ビルド {0} · {1}|Build {0} · {1}|البنية {0} · {1}|Version {0} · {1}
构建时间 {0}|Compilado el {0}|ビルド日時 {0}|Build-Zeit {0}|وقت البناء {0}|Date de compilation {0}
· 构建|· Compilación|· ビルド|· Build|· البنية|· Version
AI 默认回答和翻译目标跟随界面语言；自定义语言优先，已有内容不会被改写。|Las respuestas de IA y el idioma de traducción siguen el idioma de la interfaz por defecto. Tus elecciones explícitas tienen prioridad; el contenido existente no cambia.|AI の回答と翻訳先は既定で表示言語に従います。明示した言語を優先し、既存の内容は変更しません。|KI-Antworten und Übersetzungsziele folgen standardmäßig der Oberflächensprache. Explizite Sprachwünsche haben Vorrang; vorhandene Inhalte bleiben unverändert.|تتبع إجابات الذكاء الاصطناعي ولغة الترجمة لغة الواجهة افتراضيًا. لاختياراتك الصريحة الأولوية، ولا يتغير المحتوى الموجود.|Les réponses de l’IA et la langue de traduction suivent l’interface par défaut. Tes choix explicites sont prioritaires ; le contenu existant reste inchangé.
例如：解释清楚，适当举例。|Por ejemplo: explica con claridad y usa ejemplos cuando ayuden.|例：わかりやすく説明し、必要に応じて例を挙げる。|Zum Beispiel: Klar erklären und bei Bedarf Beispiele verwenden.|مثال: اشرح بوضوح واستخدم الأمثلة عند الحاجة.|Par exemple : expliquer clairement et donner des exemples si nécessaire.
默认按界面语言回答；在偏好或本次问题中指定其他语言时，按你的要求回答。|Por defecto se responde en el idioma de la interfaz. Si indicas otro idioma en las preferencias o en la pregunta actual, se respeta tu elección.|既定では表示言語で回答します。回答の設定や今回の質問で別の言語を指定した場合は、その指定を優先します。|Antworten folgen standardmäßig der Oberflächensprache. Sprachwünsche in deinen Vorgaben oder der aktuellen Frage haben Vorrang.|تتبع الإجابات لغة الواجهة افتراضيًا. وتُعطى الأولوية للغة التي تحددها في تفضيلاتك أو سؤالك الحالي.|Les réponses suivent l’interface par défaut. La langue précisée dans tes préférences ou ta question actuelle est prioritaire.
跟随界面语言（{0}）|Seguir idioma de la interfaz ({0})|表示言語に従う（{0}）|Oberflächensprache verwenden ({0})|اتباع لغة الواجهة ({0})|Suivre la langue de l’interface ({0})
自定义目标语言|Idioma de destino personalizado|翻訳先の言語を指定|Eigene Zielsprache|لغة ترجمة مخصصة|Langue cible personnalisée
自动识别原文语言。默认目标和默认提示词跟随界面；自定义目标与提示词会保留。|El idioma original se detecta automáticamente. El destino y la instrucción por defecto siguen la interfaz; los valores personalizados se conservan.|原文の言語は自動判定します。既定の翻訳先と指示文は表示言語に従い、カスタム設定は保持します。|Die Ausgangssprache wird automatisch erkannt. Standardziel und Standardanweisung folgen der Oberfläche; eigene Ziele und Anweisungen bleiben erhalten.|تُكتشف لغة النص تلقائيًا. تتبع اللغة المستهدفة والتعليمات الافتراضية الواجهة، مع الاحتفاظ بإعداداتك المخصصة.|La langue source est détectée automatiquement. La cible et la consigne par défaut suivent l’interface ; les réglages personnalisés sont conservés.
`;
