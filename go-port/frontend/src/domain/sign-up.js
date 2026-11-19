export class SignUp {
  static problem({ homeserver, code, username, password, confirm }) {
    if (!homeserver.trim() || !code.trim() || !username.trim() || !password) return 'Fill in every field';
    if (password !== confirm) return "The passwords don't match";
    return null;
  }

  static sentence(text) {
    for (const [pattern, sentence] of REFUSALS) {
      if (pattern.test(text)) return sentence;
    }
    return text;
  }
}

const REFUSALS = [
  [/M_UNAUTHORIZED/, "This invite code isn't valid or has expired"],
  [/M_USER_IN_USE/, 'That username is taken'],
  [/M_INVALID_USERNAME/,
    "Usernames can use letters, numbers and . _ = - / +, can't start with _ and can't be only numbers"],
  [/M_FORBIDDEN|does not offer sign-up with an invite code/, "Sign-up isn't open on this server yet"],
  [/matrix: transport:|context deadline exceeded/, "Can't reach the server. Check your connection"],
];
