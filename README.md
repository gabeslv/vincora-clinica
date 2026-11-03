# Vincóra — Gestão clínica

Aplicação web para gestão individual de consultório, com React, TypeScript, Vite e Supabase. A interface e os dados foram organizados em módulos protegidos por autenticação e políticas de acesso por profissional.

## Módulos disponíveis

- **Visão geral:** indicadores reais de agenda, pacientes e financeiro.
- **Pacientes:** cadastro, consulta, busca, edição, filtros, ordenação e arquivamento/reativação.
- **Agenda:** visualização diária, semanal e mensal; criação, edição, reagendamento e status; bloqueio de conflitos no banco.
- **Prontuários:** registros por paciente, modelos configuráveis, busca no histórico, rascunhos, finalização e adendos com justificativa. Registros finalizados ficam imutáveis.
- **Financeiro:** receitas e despesas, vencimento e pagamento, resumos, gráficos e exportação CSV.
- **Documentos:** modelos editáveis, campos automáticos, pré-visualização, emissão e impressão/Salvar PDF; anexos em armazenamento privado com links temporários.
- **Relatórios:** período configurável, indicadores de agenda e financeiro, exportação CSV e resumo sem conteúdo clínico.
- **Configurações:** dados do consultório e profissional, horários, fuso, duração padrão, redefinição de senha, MFA TOTP e exportação JSON.

## Configurar e executar

### 1. Preparar o Supabase

1. Crie um projeto no Supabase.
2. No painel do projeto, abra o **SQL Editor** e execute, nesta ordem:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_clinical_operations.sql`
   - `supabase/migrations/003_fix_audit_trigger.sql`
3. Em **Authentication → Users**, crie a conta profissional. O sistema não oferece cadastro público.
4. Em **Authentication → URL Configuration**, configure a URL local (`http://localhost:5173`) e depois a URL do site publicado em **Site URL** e em **Redirect URLs**. Para recuperação de senha funcionar no site publicado, inclua a URL publicada na lista permitida.
5. Em **Authentication → Providers / Settings**, mantenha habilitado e configure o provedor de e-mail. Habilite TOTP se quiser usar MFA.

### 2. Configurar o projeto no computador

Instale Node.js LTS. Extraia o projeto, abra um terminal dentro da pasta `vincora-clinica` e copie `.env.example` para `.env`. Preencha os valores públicos do Supabase:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA_ANON
```

No terminal, execute:

```bash
npm install
npm run dev
```

Abra o endereço local mostrado no terminal (normalmente `http://localhost:5173`) e entre com o e-mail e a senha criados no Supabase.

### 3. Publicar na web

1. Publique o código em um repositório Git privado.
2. Importe esse repositório na Vercel.
3. Nas variáveis de ambiente da Vercel, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Faça o deploy e copie o domínio final.
5. No Supabase, adicione o domínio final às **Redirect URLs** e configure-o como **Site URL**.

O arquivo `vercel.json` preserva o fallback de rotas. Após mudar variáveis na Vercel, faça novo deploy para aplicá-las.

## Estrutura principal

- `src/pages/`: módulos de pacientes, agenda, prontuários, financeiro, documentos, relatórios e configurações.
- `src/lib/supabase.ts`: cliente Supabase configurado apenas com chave pública.
- `src/types/database.ts`: tipos compartilhados.
- `supabase/migrations/`: estrutura, políticas RLS, validações e armazenamento privado.
- `public/vincora-logo.png`: identidade visual fornecida para a Vincóra.
- `SECURITY-CHECKLIST.md`: verificações operacionais antes de produção.

## Segurança e limites conhecidos

O aplicativo exige Supabase para autenticação e persistência; os dados não são simulados localmente. Nunca coloque uma chave `service_role` em variáveis `VITE_*`. As políticas RLS restringem os registros ao proprietário autenticado e o bucket de documentos é privado. Ative MFA, defina senhas fortes, revise backups e restauração, e valide configurações de produção antes de usar dados reais. A exportação JSON inclui os registros consultáveis, mas anexos do Storage devem ser baixados pela área Documentos. O projeto não substitui revisão profissional de documentos nem adequação jurídica, clínica ou operacional.

## Verificações locais

```bash
npm run build
npm audit
```
