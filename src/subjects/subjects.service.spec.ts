import { SubjectsService } from './subjects.service';

describe('SubjectsService.findAll', () => {
  it('devolve id e nome de todas as matérias, em ordem alfabética', async () => {
    const subjectRepository = {
      find: jest.fn().mockResolvedValue([
        { id: '1', name: 'Biologia', teachers: [], classes: [] },
        { id: '2', name: 'Matemática', teachers: [], classes: [] },
      ]),
    };
    const service = new SubjectsService(subjectRepository as never);

    await expect(service.findAll()).resolves.toEqual([
      { id: '1', name: 'Biologia' },
      { id: '2', name: 'Matemática' },
    ]);
    expect(subjectRepository.find).toHaveBeenCalledWith({
      order: { name: 'ASC' },
    });
  });
});
