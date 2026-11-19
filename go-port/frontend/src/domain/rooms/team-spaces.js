export class TeamSpaces {
  static alias(localpart, server) {
    return localpart && server ? `#${localpart}:${server}` : null;
  }

  static aliasFromContent(content) {
    const alias = content && typeof content === 'object' ? content.alias : undefined;
    return typeof alias === 'string' && alias.startsWith('#') && alias.indexOf(':') > 1 ? alias : null;
  }
}
