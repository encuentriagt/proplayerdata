import 'package:freezed_annotation/freezed_annotation.dart';

import '../../children/data/children_models.dart';

part 'invitation_models.freezed.dart';
part 'invitation_models.g.dart';

@freezed
abstract class InvitationOrganization with _$InvitationOrganization {
  const factory InvitationOrganization({
    required int id,
    required String name,
    String? crestUrl,
  }) = _InvitationOrganization;

  factory InvitationOrganization.fromJson(Map<String, dynamic> json) =>
      _$InvitationOrganizationFromJson(json);
}

@freezed
abstract class InvitationTeam with _$InvitationTeam {
  const factory InvitationTeam({required String name, required Sport sport}) =
      _InvitationTeam;

  factory InvitationTeam.fromJson(Map<String, dynamic> json) =>
      _$InvitationTeamFromJson(json);
}

/// Invitación del colegio para vincular a un hijo con la cuenta.
@freezed
abstract class Invitation with _$Invitation {
  const factory Invitation({
    required int id,
    required InvitationOrganization organization,
    required String playerFirstName,
    @Default(<InvitationTeam>[]) List<InvitationTeam> teams,
    String? expiresAt,
  }) = _Invitation;

  factory Invitation.fromJson(Map<String, dynamic> json) =>
      _$InvitationFromJson({
        ...json,
        'player_first_name':
            (json['player'] as Map?)?['first_name'] ??
            json['player_first_name'] ??
            '',
      });
}
