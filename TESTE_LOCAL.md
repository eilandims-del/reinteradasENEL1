# 🧪 Guia de Teste Local

Sistema de teste que funciona **100% localmente** sem precisar do Firebase, usando apenas o armazenamento do navegador (localStorage).

## 🎯 Por que usar o modo local?

- ✅ **Sem quota exceeded** - Não usa Firebase
- ✅ **Teste rápido** - Sem delays de rede
- ✅ **Gratuito** - Não consome recursos do Firebase
- ✅ **Offline** - Funciona sem internet
- ✅ **Ideal para desenvolvimento** - Testa funcionalidades sem custos

## 📁 Arquivos Criados

### Novos Arquivos:

1. **`js/services/local-storage-service.js`**
   - Serviço que simula o Firebase usando localStorage
   - Mesma interface do `firebase-service.js`
   - Compatível com todo o código existente

2. **`test-local.html`**
   - Dashboard principal em modo local
   - Mesma interface do `index.html`
   - Usa serviços locais em vez do Firebase

3. **`test-local-admin.html`**
   - Painel administrativo em modo local
   - Upload e gerenciamento de planilhas
   - Sem necessidade de login

## 🚀 Como Usar

### 1. Abrir o Painel Admin Local

Abra o arquivo `test-local-admin.html` no navegador:

```
file:///caminho/para/test-local-admin.html
```

**Ou** se estiver usando um servidor local:

```
http://localhost:8000/test-local-admin.html
```

### 2. Fazer Upload de Planilha

1. Clique em "Arraste uma planilha aqui ou clique para selecionar"
2. Selecione sua planilha (CSV, XLS, XLSX, XLSB)
3. Aguarde o processamento (muito mais rápido que Firebase!)
4. Os dados serão salvos no **localStorage do navegador**

### 3. Visualizar Dados

Abra o arquivo `test-local.html` no navegador:

```
file:///caminho/para/test-local.html
```

Você verá:
- ✅ Ranking por Elemento
- ✅ Gráficos (Causa e Alimentador)
- ✅ Mapa de Calor
- ✅ Filtros de data
- ✅ Todos os recursos do dashboard normal

## 📊 Funcionalidades Disponíveis

### ✅ Funciona (igual ao Firebase):

- Upload de planilhas (CSV, XLS, XLSX, XLSB)
- Visualização de dados
- Ranking por Elemento
- Gráficos (Pie e Radar)
- Mapa de Calor
- Filtros de data
- Histórico de uploads
- Exclusão de uploads individuais
- Limpeza completa de dados
- Modal de detalhes
- Copiar ranking para WhatsApp

### ⚠️ Limitações do Modo Local:

- **Armazenamento limitado**: localStorage tem limite de ~5-10MB
- **Apenas no navegador**: Dados não são sincronizados entre dispositivos
- **Sem autenticação real**: Login é simulado (sempre autenticado)
- **Dados temporários**: Podem ser limpos se o usuário limpar dados do navegador

## 🔧 Como Funciona

### Armazenamento

Os dados são salvos em **localStorage** do navegador:

```javascript
// Chave: 'enel_reinteradas_data'
// Contém: Array de todos os registros

// Chave: 'enel_reinteradas_uploads'
// Contém: Array de metadados dos uploads
```

### Estrutura dos Dados

**Registros (`enel_reinteradas_data`):**
```json
[
  {
    "id": "local_1234567890_abc123_0",
    "INCIDENCIA": "...",
    "CAUSA": "...",
    "ALIMENT.": "...",
    "DATA": "2026-01-15",
    "ELEMENTO": "...",
    "CONJUNTO": "...",
    "uploadId": "local_1234567890_abc123",
    "rowIndex": 0,
    "createdAt": "2026-01-16T10:30:00.000Z"
  }
]
```

**Uploads (`enel_reinteradas_uploads`):**
```json
[
  {
    "id": "local_1234567890_abc123",
    "fileName": "planilha.xlsx",
    "fileSize": 123456,
    "totalRecords": 1720,
    "uploadedAt": "2026-01-16T10:30:00.000Z",
    "uploadedBy": "local_user"
  }
]
```

## 🗑️ Limpar Dados Locais

### Opção 1: Pelo Painel Admin

1. Abra `test-local-admin.html`
2. Clique em **"Limpar Tudo"**
3. Confirme duas vezes
4. Todos os dados serão removidos

### Opção 2: Manualmente (Console do Navegador)

Abra o Console (F12) e execute:

```javascript
// Limpar dados
localStorage.removeItem('enel_reinteradas_data');
localStorage.removeItem('enel_reinteradas_uploads');

// Recarregar página
location.reload();
```

### Opção 3: Limpar Tudo do Navegador

1. F12 → Aba "Application" (Chrome) ou "Armazenamento" (Firefox)
2. Local Storage → Seu domínio
3. Delete as chaves:
   - `enel_reinteradas_data`
   - `enel_reinteradas_uploads`

## 📈 Capacidade

### Limite de Armazenamento:

- **localStorage**: ~5-10MB (depende do navegador)
- **Registros típicos**: ~1-2KB cada
- **Capacidade estimada**: ~2.500-5.000 registros

### Se Exceder o Limite:

O navegador mostrará erro:
```
QuotaExceededError: Failed to execute 'setItem' on 'Storage'
```

**Solução:**
1. Limpe dados antigos
2. Use planilhas menores
3. Ou migre para Firebase (quando resolver quota)

## 🔄 Migrar Dados para Firebase

Quando quiser migrar dados locais para Firebase:

1. **Exportar dados locais:**
   ```javascript
   // No console do navegador
   const data = JSON.parse(localStorage.getItem('enel_reinteradas_data'));
   console.log(JSON.stringify(data, null, 2));
   // Copie o JSON
   ```

2. **Importar no Firebase:**
   - Use o painel admin normal (`admin.html`)
   - Ou crie um script de importação

## 🐛 Troubleshooting

### "Nenhum dado disponível"

**Causa:** localStorage está vazio

**Solução:**
1. Faça upload de uma planilha no `test-local-admin.html`
2. Verifique se os dados foram salvos (F12 → Application → Local Storage)

### "Erro ao salvar dados"

**Causa:** localStorage cheio ou navegador bloqueou

**Solução:**
1. Limpe dados antigos
2. Tente com planilha menor
3. Verifique permissões do navegador

### "Dados não aparecem no dashboard"

**Causa:** Dados salvos em outro navegador/sessão

**Solução:**
- localStorage é **por navegador e domínio**
- Use o mesmo navegador onde fez upload
- Ou exporte/importe os dados

### "Botão não funciona"

**Causa:** JavaScript não carregou ou erro no console

**Solução:**
1. Abra o Console (F12)
2. Verifique erros
3. Recarregue a página (Ctrl+R)

## 📝 Comparação: Local vs Firebase

| Recurso | Local (localStorage) | Firebase |
|---------|---------------------|----------|
| **Velocidade** | ⚡ Muito rápido | 🐢 Depende da rede |
| **Quota** | ✅ Sem limite de quota | ⚠️ Limite no plano gratuito |
| **Sincronização** | ❌ Apenas local | ✅ Multi-dispositivo |
| **Persistência** | ⚠️ Pode ser limpo | ✅ Permanente |
| **Autenticação** | ❌ Simulada | ✅ Real |
| **Custo** | ✅ Gratuito | 💰 Pago após free tier |
| **Offline** | ✅ Sempre offline | ⚠️ Requer conexão |

## ✅ Checklist de Teste

Teste todas as funcionalidades:

- [ ] Upload de planilha CSV
- [ ] Upload de planilha XLSX
- [ ] Visualização de dados no dashboard
- [ ] Ranking por Elemento
- [ ] Gráfico de Causa
- [ ] Gráfico de Alimentador
- [ ] Mapa de Calor
- [ ] Filtro de data
- [ ] Modal de detalhes
- [ ] Copiar ranking
- [ ] Excluir upload individual
- [ ] Limpar tudo
- [ ] Histórico de uploads

## 🎯 Próximos Passos

1. **Teste localmente** com `test-local.html` e `test-local-admin.html`
2. **Valide todas as funcionalidades**
3. **Quando estiver pronto**, use o sistema normal com Firebase
4. **Ou** faça upgrade do Firebase para plano pago

---

## 💡 Dica

Para desenvolvimento, use sempre o modo local primeiro. Só migre para Firebase quando:
- ✅ Funcionalidades estiverem validadas
- ✅ Quota do Firebase estiver resolvida
- ✅ Precisa de sincronização multi-dispositivo

**Bons testes! 🚀**
