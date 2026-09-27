// Projeto `ui`: tela renderizada com jest-expo, store real sobre o MockTransport.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LoginScreen } from './login-screen';

test('empty form shows the server validation message', async () => {
  await render(<LoginScreen />); // RNTL 14: render é assíncrono
  await fireEvent.press(screen.getByRole('button')); // idem: aguarde para o act cobrir a store
  expect(await screen.findByText('Informe e-mail e senha.')).toBeTruthy();
});
