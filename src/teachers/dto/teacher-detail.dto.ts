export class TeacherDetailDto {
  id: string;
  name: string;
  email: string;
  /* Apresentação do professor */
  bio: string | null;
  active: boolean;
  subjects: { id: string; name: string }[];
}
