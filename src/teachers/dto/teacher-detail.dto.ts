export class TeacherDetailDto {
  id: string;
  name: string;
  email: string;
  phone: string;
  /* Apresentação do professor */
  bio: string | null;
  active: boolean;
  subjects: { id: string; name: string }[];
}
