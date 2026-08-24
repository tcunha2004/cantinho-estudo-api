/*
 * Vida de um link de cadastro. `waiting` só acontece depois do envio do
 * formulário COMPLETO — enquanto o aluno preenche, o link segue `pending`.
 */
export enum SignupStatus {
  PENDING = 'pending',
  WAITING = 'waiting',
  APPROVED = 'approved',
}
