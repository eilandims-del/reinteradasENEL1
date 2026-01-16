# Guia de Upload e Limpeza de Dados

## 📤 Como Importar Planilhas

### Processo de Upload

O sistema foi otimizado para lidar com grandes volumes de dados (milhares de registros) sem estourar a quota do Firestore.

#### Características Implementadas

1. **Batching Seguro**
   - Tamanho de batch: 250 operações (margem segura abaixo do limite de 500)
   - Processamento sequencial de batches para evitar sobrecarga

2. **Throttling**
   - Delay de 500ms entre batches
   - Previne sobrecarga do backend

3. **Retry com Exponential Backoff**
   - Máximo de 5 tentativas por batch
   - Backoff exponencial: 1s, 2s, 4s, 8s, 16s
   - Jitter aleatório (0-500ms) para evitar thundering herd
   - Aplica-se apenas a erros transitórios:
     - `resource-exhausted` (quota excedida)
     - `unavailable` (serviço indisponível)
     - `deadline-exceeded` (timeout)

4. **Idempotência**
   - Cada registro recebe um ID determinístico: `${uploadId}_${rowIndex}`
   - Reimportar o mesmo arquivo não duplica dados
   - Usa `set()` com `merge: true` para garantir idempotência

5. **Logs de Progresso**
   - Console mostra: `Batch X/Y commitado: N registros (total/total - X%)`
   - UI mostra progresso em tempo real
   - Em caso de erro: código do erro + tentativa atual + próximo delay

#### Como Fazer Upload

1. Acesse o painel administrativo (`admin.html`)
2. Faça login com suas credenciais
3. Clique na área de upload ou arraste o arquivo
4. Formatos aceitos: CSV, XLS, XLSX, XLSB
5. Aguarde o processamento (progresso é exibido em tempo real)

#### Exemplo de Upload de 3320 Registros

```
[UPLOAD] Iniciando upload de 3320 registros em 14 batches
[UPLOAD] Batch 1/14 commitado: 250 registros (250/3320 - 7%)
[UPLOAD] Batch 2/14 commitado: 250 registros (500/3320 - 15%)
...
[UPLOAD] Batch 14/14 commitado: 70 registros (3320/3320 - 100%)
[UPLOAD] Upload concluído: 3320 registros salvos com sucesso
```

#### Tratamento de Erros

Se ocorrer `resource-exhausted`:
- O sistema automaticamente reduz a taxa (backoff)
- Aguarda o tempo calculado antes de retentar
- Continua de onde parou sem perder dados já salvos
- UI permanece responsiva durante o processo

---

## 🗑️ Como Limpar um Upload

### Rotina de Limpeza Segura

A limpeza é restrita a usuários autenticados como admin e permite excluir dados de um upload específico por `uploadId`.

#### Características

1. **Segurança**
   - Requer autenticação de admin
   - Limpeza apenas por `uploadId` (escopo controlado)
   - Não permite exclusão de coleções críticas

2. **Batching e Throttling**
   - Batches de 250 documentos
   - Delay de 500ms entre batches
   - Retry com exponential backoff (mesma lógica do upload)

3. **Processo**
   - Busca documentos com `where('uploadId', '==', uploadId)`
   - Exclui em batches sequenciais
   - Remove também o registro na coleção `uploads`

#### Como Limpar

1. Acesse o painel administrativo
2. Na seção "Histórico de Uploads", localize o upload desejado
3. Clique no botão "Excluir" (ícone de lixeira)
4. Confirme a exclusão no diálogo
5. Aguarde o processamento (pode levar alguns segundos para grandes volumes)

#### Exemplo de Limpeza

```
[DELETE] Iniciando exclusão do upload: abc123
[DELETE] Preparando exclusão de 3320 registros em 14 batches
[DELETE] Batch 1/14 commitado: 250 registros (250/3320)
[DELETE] Batch 2/14 commitado: 250 registros (500/3320)
...
[DELETE] Batch 14/14 commitado: 70 registros (3320/3320)
[DELETE] Registro de upload removido da coleção uploads
[DELETE] Exclusão concluída com sucesso: 3320 registros removidos
```

#### Tratamento de Erros

- Erros transitórios são tratados automaticamente com retry
- Se a exclusão falhar parcialmente, o sistema informa quantos registros foram removidos
- É possível tentar novamente sem duplicar exclusões

---

## ⚠️ Sobre Erros no Console

### `chrome-extension://... Unexpected token 'export'`

**Causa:** Extensão do Chrome tentando processar arquivos JavaScript do projeto.

**Solução:** Este erro não é um bug do código. É causado por extensões do navegador (como React DevTools, Redux DevTools, etc.) que tentam processar módulos ES6.

**Ação:** 
- Pode ser ignorado com segurança
- Se incomodar, desabilite extensões de desenvolvimento no navegador
- Não afeta o funcionamento da aplicação

### `favicon.ico 404`

**Status:** ✅ **Corrigido**

O favicon foi adicionado ao projeto:
- `favicon.svg` (formato moderno, suportado por navegadores recentes)
- Referência adicionada em `index.html` e `admin.html`

---

## 📊 Monitoramento e Logs

### Logs de Upload

Todos os logs são prefixados com `[UPLOAD]`:
- Início do upload
- Progresso por batch
- Erros e retries
- Conclusão

### Logs de Limpeza

Todos os logs são prefixados com `[DELETE]`:
- Início da exclusão
- Progresso por batch
- Erros e retries
- Conclusão

### Exemplo de Log de Erro com Retry

```
[UPLOAD] Erro transitório no batch 5 (tentativa 1/5): resource-exhausted
Próximo retry em 1234ms
[UPLOAD] Batch 5/14 commitado: 250 registros (1250/3320 - 37%)
```

---

## 🔧 Configurações Técnicas

### Parâmetros Ajustáveis

No arquivo `js/services/firebase-service.js`, método `saveData()`:

```javascript
const BATCH_SIZE = 250;        // Tamanho do batch (200-300 recomendado)
const THROTTLE_MS = 500;       // Delay entre batches (300-800ms recomendado)
const MAX_RETRIES = 5;         // Máximo de tentativas
const INITIAL_BACKOFF_MS = 1000; // Backoff inicial
```

### Ajuste para Ambientes Diferentes

- **Ambiente de desenvolvimento:** Pode reduzir `THROTTLE_MS` para 300ms
- **Ambiente de produção com quota limitada:** Aumentar `THROTTLE_MS` para 800ms
- **Volumes muito grandes (>10k registros):** Considerar reduzir `BATCH_SIZE` para 200

---

## ✅ Checklist de Validação

Após implementar as correções, valide:

- [ ] Upload de 3320 registros completa sem `resource-exhausted`
- [ ] Progresso é exibido em tempo real na UI
- [ ] Logs mostram batches sendo processados
- [ ] Reimportar mesmo arquivo não duplica dados (idempotência)
- [ ] Limpeza por uploadId funciona corretamente
- [ ] Erros transitórios são tratados com retry
- [ ] Favicon aparece no navegador (sem 404)
- [ ] Console não mostra erros críticos (apenas extensões do Chrome)

---

## 📝 Notas Importantes

1. **Não use `Promise.all()` com milhares de writes/deletes** - Processe sequencialmente
2. **Não aumente delays arbitrários sem batching** - Use a combinação de batching + throttling + retry
3. **Idempotência é essencial** - Permite reimportar sem duplicar dados
4. **Monitore os logs** - Eles indicam se o sistema está funcionando corretamente

---

## 🆘 Troubleshooting

### Upload trava ou falha constantemente

1. Verifique os logs no console
2. Se aparecer `resource-exhausted` repetidamente:
   - Aumente `THROTTLE_MS` para 800-1000ms
   - Reduza `BATCH_SIZE` para 200
3. Verifique se há outros processos usando o Firestore simultaneamente

### Limpeza não remove todos os registros

1. Verifique se o `uploadId` está correto
2. Verifique os logs para ver quantos registros foram encontrados
3. Se houver `remainingCount > 0`, tente executar a limpeza novamente

### Progresso não atualiza na UI

1. Verifique se o callback `updateProgress` está sendo chamado
2. Verifique o console para logs de progresso
3. A UI pode estar sendo bloqueada - verifique se há erros JavaScript
