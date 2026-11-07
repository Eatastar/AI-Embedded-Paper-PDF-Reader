const { readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } = require('node:fs');
const { dirname } = require('node:path');

const FIELDS = ['id', 'name', 'apiFormat', 'baseURL', 'model', 'systemPrompt', 'imageInput'];

/** The desktop supplies safeStorage after app-ready; the browser saves metadata. */
function createProfileStore({ filePath, safeStorage }) {
  let encrypted = false;
  try { encrypted = Boolean(safeStorage?.isEncryptionAvailable()); } catch { /* Metadata storage remains usable. */ }
  let warning = safeStorage && !encrypted ? '系统加密暂不可用：配置会保存，密钥仅本次运行有效。' : '';
  let blocked = false;
  const metadata = profile => Object.fromEntries(FIELDS.filter(key => key !== 'imageInput' || profile[key] !== undefined).map(key => [key, profile[key]]));

  return {
    persistence: encrypted ? 'encrypted' : 'configuration',
    get warning() { return warning; },
    load() {
      let saved;
      try { saved = JSON.parse(readFileSync(filePath, 'utf8')); }
      catch (error) {
        if (error.code === 'ENOENT') return null;
        blocked = true;
        warning = '已保存的模型配置无法读取，原文件已保留。请先修复或备份该配置文件。';
        return null;
      }
      try {
        if (saved.schemaVersion !== 1 || !Array.isArray(saved.profiles) || saved.profiles.length > 50) throw new Error('Invalid profile file');
        return {
          mode: saved.mode,
          activeProfileId: saved.activeProfileId,
          profiles: saved.profiles.map(profile => {
            const result = { ...metadata(profile), apiKey: '' };
            if (profile.encryptedApiKey) {
              if (!encrypted || typeof profile.encryptedApiKey !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(profile.encryptedApiKey)) throw new Error('Cannot decrypt saved key');
              result.apiKey = safeStorage.decryptString(Buffer.from(profile.encryptedApiKey, 'base64'));
            }
            return result;
          }),
        };
      } catch {
        blocked = true;
        warning = '已保存的模型配置或密钥无法在当前账户读取，原文件已保留，未覆盖。请使用原 Windows 账户检查配置。';
        return null;
      }
    },
    save(snapshot) {
      if (blocked) throw new Error(warning);
      const temporary = filePath + '.tmp-' + process.pid;
      try {
        const profiles = snapshot.profiles.map(profile => {
          const result = metadata(profile);
          if (encrypted && profile.apiKey) result.encryptedApiKey = safeStorage.encryptString(profile.apiKey).toString('base64');
          return result;
        });
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, mode: snapshot.mode, activeProfileId: snapshot.activeProfileId, profiles }), { encoding: 'utf8', mode: 0o600 });
        renameSync(temporary, filePath);
      } catch {
        try { unlinkSync(temporary); } catch { /* No temporary file to clean. */ }
        throw new Error('模型配置未能保存，请检查本机数据目录是否可以写入。');
      }
    },
  };
}

module.exports = { createProfileStore };
