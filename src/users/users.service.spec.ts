import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from 'src/jwt/jwt.service';
import { MailService } from 'src/mail/mail.service';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Verification } from './entities/verification.entity';
import { UserService } from './users.service';

const mockRepository = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
});

const mockJwtService = () => ({
  sign: jest.fn(() => 'signed-token'),
  verify: jest.fn(),
});

const mockMailService = () => ({
  sendVerificationEmail: jest.fn(),
});

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;

describe('User Service', () => {
  let service: UserService;
  let usersRepository: MockRepository<User>;
  let verificationRepository: MockRepository<Verification>;
  let mailService: MailService;
  let jwtService: JwtService;

  // module을 생성, service를 불러온다.
  // beforeAll은 아래 생성된 하나로 모든 테스트 describe에서 공용사용
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UserService, // 실 UserService를 불러오고, 필요로 하는 Repository에 대해서는 mock를 하여 제공
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository(),
        },
        {
          provide: getRepositoryToken(Verification),
          useValue: mockRepository(),
        },
        {
          provide: JwtService,
          useValue: mockJwtService(),
        },
        {
          provide: MailService,
          useValue: mockMailService(),
        },
      ],
    }).compile();
    service = module.get<UserService>(UserService);
    mailService = module.get<MailService>(MailService);
    jwtService = module.get<JwtService>(JwtService);
    usersRepository = module.get(getRepositoryToken(User));
    verificationRepository = module.get(getRepositoryToken(Verification));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAccount', () => {
    const createAccountArgs = {
      email: 'email@email.com',
      password: 'password',
      role: 0,
    };

    it('should fail if user exists', async () => {
      usersRepository.findOne.mockResolvedValue({
        // mockResolvedValue는 Promise resolve를 리턴해줌
        id: 1,
        email: 'test@test.com',
      });
      const result = await service.createAccount(createAccountArgs);
      expect(result).toMatchObject({
        ok: false,
        error: 'There is a user with that email already',
      });
    });

    it('should create a new user', async () => {
      usersRepository.findOne.mockReturnValue(undefined); // exists
      usersRepository.create.mockReturnValue(createAccountArgs);
      usersRepository.save.mockResolvedValue(createAccountArgs);
      verificationRepository.create.mockReturnValue({
        user: createAccountArgs,
      });
      verificationRepository.save.mockResolvedValue({
        code: 'code',
      });
      const result = await service.createAccount(createAccountArgs);
      expect(usersRepository.create).toHaveBeenCalledTimes(1);
      expect(usersRepository.create).toHaveBeenCalledWith(createAccountArgs);
      expect(usersRepository.save).toHaveBeenCalledTimes(1);
      expect(usersRepository.save).toHaveBeenCalledWith(createAccountArgs);
      expect(verificationRepository.create).toHaveBeenCalledTimes(1);
      expect(verificationRepository.create).toHaveBeenCalledWith({
        user: createAccountArgs,
      });
      expect(verificationRepository.save).toHaveBeenCalledTimes(1);
      expect(verificationRepository.save).toHaveBeenCalledWith({
        user: createAccountArgs,
      });
      expect(mailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
      );
      expect(result).toEqual({ ok: true });
    });

    it('should fail on exception', async () => {
      usersRepository.findOne.mockRejectedValue(new Error(':p'));
      const result = await service.createAccount(createAccountArgs);
      expect(result).toEqual({ ok: false, error: 'cannot create account' });
    });
  });

  describe('login', () => {
    const loginArgs = {
      email: 'email@email.com',
      password: 'password',
    };
    it('should fail if user does not exist', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      const result = await service.login(loginArgs);
      expect(usersRepository.findOne).toHaveBeenCalledTimes(1);
      expect(usersRepository.findOne).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
      );
      expect(result).toEqual({ ok: false, error: 'User not found' });
    });

    it('should fail if password is not matched', async () => {
      const mockedUser = {
        id: 1,
        checkPassword: jest.fn(() => Promise.resolve(false)),
      };
      usersRepository.findOne.mockResolvedValue(mockedUser);
      const result = await service.login(loginArgs);
      expect(result).toEqual({ ok: false, error: 'Wrong Password' });
    });

    it('should return token if password is correct', async () => {
      const mockedUser = {
        id: 1,
        checkPassword: jest.fn(() => Promise.resolve(true)),
      };
      usersRepository.findOne.mockResolvedValue(mockedUser);
      const result = await service.login(loginArgs);
      expect(jwtService.sign).toHaveBeenCalledTimes(1);
      expect(jwtService.sign).toHaveBeenCalledWith(expect.any(Number));
      expect(result).toEqual({ ok: true, token: expect.any(String) });
    });

    it('should return a exception when error occured', async () => {
      usersRepository.findOne.mockRejectedValue('Error');
      const result = await service.login(loginArgs);
      expect(result).toEqual({ ok: false, error: expect.any(String) });
    });
  });

  describe('findById', () => {
    it('should return error if user not exists', async () => {
      // usersRepository.findOne.mockRejectedValue('User Not Found');
      usersRepository.findOne.mockResolvedValue(null);
      const result = await service.findById(expect.any(Number));
      expect(result).toEqual({ ok: false, error: 'User Not Found' });
    });

    it('should return user if user exists', async () => {
      const mockedUser = {
        id: 1,
        email: 'email@naver.com',
      };
      usersRepository.findOne.mockResolvedValue(mockedUser);
      const result = await service.findById(expect.any(Number));
      expect(result).toEqual({ ok: true, user: mockedUser });
    });

    it('should return error on exception', async () => {
      usersRepository.findOne.mockRejectedValue(new Error());
      const result = await service.findById(expect.any(Number));
      expect(result).toEqual({ ok: false, error: 'User Not Found' });
    })
  });

  describe('editProfile', () => {
    it('should change email', async () => {
      const editProfileArgs = {
        userId: 1,
        input: { email: 'new@gmail.com' },
      };
      const oldUser = {
        email: 'old@gmail.com',
        verified: true,
      };
      const newUser = {
        email: 'new@gmail.com',
        verified: false,
      };
      const newVerification = {
        code: 'code',
      };
      usersRepository.findOne.mockResolvedValue(oldUser);
      verificationRepository.create.mockReturnValue(newVerification);
      verificationRepository.save.mockResolvedValue(newVerification);

      await service.editProfile(editProfileArgs.userId, editProfileArgs.input);
      expect(usersRepository.findOne).toHaveBeenCalledTimes(1);
      expect(usersRepository.findOne).toHaveBeenCalledWith(
        editProfileArgs.userId,
      );
      expect(verificationRepository.create).toHaveBeenCalledWith({
        user: newUser,
      });
      expect(verificationRepository.save).toHaveBeenCalledWith(newVerification);

      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        newUser.email,
        newVerification.code,
      );
    });

    it('should change password', async () => {
      const editProfileArgs = {
        userId: 1,
        input: { password: 'changed' }
      };
      const oldUser = {
        email: 'old@gmail.com',
        password: 'old'
      }
      const newUser = {
        email: 'old@gmail.com',
        password: 'changed'
      }
      usersRepository.findOne.mockResolvedValue(oldUser);
      const result = await service.editProfile(editProfileArgs.userId, editProfileArgs.input);
      expect(usersRepository.save).toHaveBeenCalledTimes(1);
      expect(usersRepository.save).toHaveBeenCalledWith(newUser);
      expect(result).toEqual({ ok: true });
    });

    it('should fail on Exception', async () => {
      const editProfileArgs = {
        userId: 1,
        input: { email: 'new@gmail.com' },
      }
      usersRepository.findOne.mockRejectedValue(new Error('error'));
      const result = await service.editProfile(editProfileArgs.userId, {});
      expect(result).toEqual({ ok: false, error: expect.any(Error) });
    })
  });

  describe('verifyEmail', () => {
    const mockedVerification = {
      id: 1,
      user: {
        verified: false
      }
    }
    const mockedAfterVerification = {
      id: 1,
      user: {
        verified: true
      }
    }
    it('should verify Email', async () => {
      verificationRepository.findOne.mockResolvedValue(mockedVerification);
      const result = await service.verifyEmail('code');
      expect(verificationRepository.findOne).toHaveBeenCalledTimes(1);
      expect(verificationRepository.findOne).toHaveBeenCalledWith(expect.any(Object), expect.any(Object));
      expect(usersRepository.save).toHaveBeenCalledTimes(1);
      expect(usersRepository.save).toHaveBeenCalledWith(mockedAfterVerification.user);
      expect(verificationRepository.delete).toHaveBeenCalledWith(mockedVerification.id);
      expect(result).toEqual({ ok: true });
    });
    it('should fail if verification does not exists', async () => {
      verificationRepository.findOne.mockResolvedValue(null);
      const result = await service.verifyEmail('code');
      expect(result).toEqual({ ok: false, error: 'Not a valid verification code' });
    });
    it('should fail on Exception', async () => {
      verificationRepository.findOne.mockRejectedValue(new Error());
      const result = await service.verifyEmail('code');
      expect(result).toEqual({ ok: false, error: 'Could not verify Email' });
    })
  })
});
