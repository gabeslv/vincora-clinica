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
